# TestMeMan Windows Assessment App - Enterprise Process Lockdown Script
# Forcefully terminates unauthorized applications for company OA compliance

$forbiddenList = @(
    "chrome", "msedge", "firefox", "brave", "opera", "vivaldi", "arc", "tor",
    "discord", "slack", "telegram", "whatsapp", "teams", "zoom", "skype", "webex",
    "anydesk", "teamviewer", "vncviewer", "parsec", "rustdesk", "ultraviewer", "remotedesktop", "mstsc",
    "chatgpt", "claude", "notepad", "notepad++", "code", "sublime_text", "pycharm64", "idea64",
    "obs64", "obs32", "camtasia", "bandicam", "sharex", "snagit32", "snagit"
)

Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host "  TestMeMan Secure Assessment - Process Lockdown Initiated" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Yellow

$killedCount = 0

foreach ($appName in $forbiddenList) {
    $processes = Get-Process -Name $appName -ErrorAction SilentlyContinue
    if ($processes) {
        foreach ($proc in $processes) {
            try {
                Stop-Process -Id $proc.Id -Force
                Write-Host "  [CLOSED] Terminated: $($proc.ProcessName) (PID: $($proc.Id))" -ForegroundColor Green
                $killedCount++
            } catch {
                Write-Host "  [WARN] Could not stop $($proc.ProcessName): $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    }
}

Write-Host "----------------------------------------------------------" -ForegroundColor Yellow
Write-Host "  Lockdown complete. Terminated $killedCount unauthorized process(es)." -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Yellow
