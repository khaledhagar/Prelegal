# Shared implementation behind start-windows.ps1 and stop-windows.ps1.
#
# Mirrors scripts/lib/prelegal.sh. PowerShell cannot run the shell version, so
# the logic exists twice; keep the two in step when changing either.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:ImageName = 'prelegal:local'
$script:ContainerName = 'prelegal'
$script:Port = if ($env:PRELEGAL_PORT) { $env:PRELEGAL_PORT } else { '8000' }
# Accounts and saved documents live here. A *named* volume, so that removing
# the container -- which Stop-Prelegal does, and which every start does first --
# leaves the data behind. Deleting it is `docker volume rm prelegal-data`.
$script:DataVolume = if ($env:PRELEGAL_DATA_VOLUME) { $env:PRELEGAL_DATA_VOLUME } else { 'prelegal-data' }
$script:RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

function Assert-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'docker is not installed or not on PATH.'
    }
    docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        throw 'docker is installed but not running -- start Docker Desktop and try again.'
    }
}

function Test-ContainerRunning {
    $id = docker ps --quiet --filter "name=^/$script:ContainerName$"
    return -not [string]::IsNullOrWhiteSpace($id)
}

# Polls until the app reports a ready database. The container is up long before
# the app is, so returning at `docker run` would hand the user a URL that
# refuses connections.
function Wait-UntilReady {
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        try {
            Invoke-RestMethod -Uri "http://localhost:$script:Port/api/health" -TimeoutSec 2 | Out-Null
            return $true
        }
        catch {
            # Not up yet. A container that has already exited never will be, so
            # say so now rather than after the full timeout.
            if (-not (Test-ContainerRunning)) {
                Write-Host 'The container stopped during startup. Last output:'
                docker logs $script:ContainerName 2>&1 | Select-Object -Last 20
                return $false
            }
            Start-Sleep -Seconds 1
        }
    }

    Write-Host "Timed out waiting for http://localhost:$script:Port/api/health. Last output:"
    docker logs $script:ContainerName 2>&1 | Select-Object -Last 20
    return $false
}

function Start-Prelegal {
    Assert-Docker

    Write-Host "Building $script:ImageName ..."
    docker build --tag $script:ImageName $script:RepoRoot
    if ($LASTEXITCODE -ne 0) { throw 'docker build failed.' }

    # Replace any previous container. Safe because the database is on a named
    # volume rather than inside the container, so it outlives this.
    docker rm --force $script:ContainerName *> $null

    # The image deliberately ships without credentials, so the assistant's key
    # is handed over at run time. `--env NAME` passes it from this environment
    # by name: the value never appears in the process list.
    $envFile = Join-Path $script:RepoRoot '.env'
    if (Test-Path $envFile) {
        $envArgs = @('--env-file', $envFile)
    }
    elseif ($env:OPENROUTER_API_KEY) {
        $envArgs = @('--env', 'OPENROUTER_API_KEY')
    }
    else {
        $envArgs = @()
        Write-Host 'warning: no .env and no OPENROUTER_API_KEY -- the AI chat will be'
        Write-Host '         unavailable. Everything else works.'
    }

    Write-Host "Starting $script:ContainerName on port $script:Port ..."
    docker run --detach --name $script:ContainerName --publish "$($script:Port):8000" --volume "$($script:DataVolume):/data" @envArgs $script:ImageName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'docker run failed.' }

    if (Wait-UntilReady) {
        Write-Host "Prelegal is running at http://localhost:$script:Port"
    }
    else {
        throw 'Prelegal failed to start.'
    }
}

function Stop-Prelegal {
    Assert-Docker

    $id = docker ps --all --quiet --filter "name=^/$script:ContainerName$"
    if ([string]::IsNullOrWhiteSpace($id)) {
        Write-Host "$script:ContainerName is not running."
        return
    }

    docker rm --force $script:ContainerName | Out-Null
    Write-Host "Stopped $script:ContainerName."
}
