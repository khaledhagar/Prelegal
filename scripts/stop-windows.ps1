# Stop Prelegal on Windows.
#
#   pwsh -File scripts/stop-windows.ps1
#
# Removes the container. Nothing is lost: the database is rebuilt from scratch
# on every start.

. (Join-Path $PSScriptRoot 'lib/Prelegal.ps1')

Stop-Prelegal
