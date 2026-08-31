#define MyAppName "Aptora"
#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif
#ifndef SourceRoot
  #define SourceRoot "..\.."
#endif
#ifndef BuildRoot
  #define BuildRoot "..\..\.build\installer"
#endif
#ifndef ReleaseDir
  #define ReleaseDir "..\..\dist"
#endif
#define MyAppPublisher "E-Data Teknoloji"
#define MyAppExeName "run.bat"

[Setup]
AppId={{8B196C5F-F4D3-4CD2-9F6D-E44C4CE76461}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DisableProgramGroupPage=yes
OutputDir={#ReleaseDir}
OutputBaseFilename=AptoraSetup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
SetupIconFile={#SourceRoot}\client\public\aptora.ico
UninstallDisplayIcon={app}\client\dist\aptora.ico
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Dirs]
Name: "{commonappdata}\Aptora"
Name: "{commonappdata}\Aptora\logs"

[Files]
Source: "{#BuildRoot}\bin\node.exe"; DestDir: "{app}\bin"; Flags: ignoreversion
Source: "{#SourceRoot}\server\*.js"; DestDir: "{app}\server"; Flags: ignoreversion
Source: "{#SourceRoot}\server\package.json"; DestDir: "{app}\server"; Flags: ignoreversion
Source: "{#SourceRoot}\server\package-lock.json"; DestDir: "{app}\server"; Flags: ignoreversion
Source: "{#BuildRoot}\server\node_modules\*"; DestDir: "{app}\server\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#BuildRoot}\client\dist\*"; DestDir: "{app}\client\dist"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceRoot}\deployment\windows\run.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceRoot}\deployment\windows\run-backend.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceRoot}\deployment\windows\setup.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceRoot}\deployment\windows\AptoraControlPanel.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceRoot}\deployment\windows\server-control.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceRoot}\docs\DEPLOYMENT.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceRoot}\version.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\Aptora Control Panel"; Filename: "{app}\AptoraControlPanel.bat"; IconFilename: "{app}\client\dist\aptora.ico"
Name: "{commondesktop}\Aptora Control Panel"; Filename: "{app}\AptoraControlPanel.bat"; IconFilename: "{app}\client\dist\aptora.ico"

[InstallDelete]
Type: files; Name: "{autoprograms}\Aptora.lnk"
Type: files; Name: "{autodesktop}\Aptora.lnk"
Type: files; Name: "{commondesktop}\Aptora.lnk"

[Run]
Filename: "{cmd}"; Parameters: "/c ""{app}\setup.bat"""; WorkingDir: "{app}"; Description: "Configure Aptora and create the administrator"; Flags: waituntilterminated skipifsilent; Check: NeedsInitialSetup
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\server-control.ps1"" Start"; WorkingDir: "{app}"; Flags: runhidden waituntilterminated; Check: ExistingInstallation
Filename: "{app}\AptoraControlPanel.bat"; WorkingDir: "{app}"; Description: "Open Aptora Control Panel"; Flags: postinstall shellexec nowait skipifsilent

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\server-control.ps1"" Stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopAptora"
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\server-control.ps1"" RemoveTask"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveAptoraTask"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""Aptora Server (TCP 9372)"""; Flags: runhidden waituntilterminated; RunOnceId: "RemoveAptoraFirewallRule"

[Code]
function HasAdministrator(): Boolean;
var
  ResultCode: Integer;
begin
  Result := False;
  if not FileExists(ExpandConstant('{commonappdata}\Aptora\database.sqlite')) then
    exit;
  if Exec(
    ExpandConstant('{app}\bin\node.exe'),
    '"' + ExpandConstant('{app}\server\has-admin.js') + '"',
    ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode
  ) then
    Result := ResultCode = 0;
end;

function NeedsInitialSetup(): Boolean;
begin
  Result := not HasAdministrator();
end;

function ExistingInstallation(): Boolean;
begin
  Result := HasAdministrator();
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Result := '';
  if FileExists(ExpandConstant('{app}\server-control.ps1')) then
    Exec('powershell.exe', '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\server-control.ps1') + '" Stop', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;
