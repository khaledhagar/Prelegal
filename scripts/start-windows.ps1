# Start Prelegal on Windows.
#
#   pwsh -File scripts/start-windows.ps1
#
# Builds the image and runs it, then waits until the app answers before
# reporting the URL. Set PRELEGAL_PORT to use a port other than 8000.

. (Join-Path $PSScriptRoot 'lib/Prelegal.ps1')

Start-Prelegal
