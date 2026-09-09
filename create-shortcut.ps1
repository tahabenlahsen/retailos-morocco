# Creates a desktop shortcut for RetailOS Morocco
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\RetailOS Morocco.lnk")
$Shortcut.TargetPath = "$PSScriptRoot\START.bat"
$Shortcut.WorkingDirectory = $PSScriptRoot
$Shortcut.IconLocation = "shell32.dll,13"
$Shortcut.Description = "Start RetailOS Morocco"
$Shortcut.Save()
Write-Host "Desktop shortcut created: RetailOS Morocco"
