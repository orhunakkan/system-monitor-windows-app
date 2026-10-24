; Included by electron-builder's NSIS templates (build/ is buildResources).

; Remove the "Start at Login" entry written by app.setLoginItemSettings() in
; src/main/main.js. Skipped on updates, which run the old uninstaller first.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "io.github.orhunakkan.SystemMonitorResources"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "io.github.orhunakkan.SystemMonitorResources"
  ${endIf}
!macroend
