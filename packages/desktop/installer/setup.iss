[Setup]
AppName=MyBizOne
AppVersion={#AppVersion}
AppPublisher=MyBizOne Technologies
AppPublisherURL=https://mybizoneapp.com
AppSupportURL=https://mybizoneapp.com/support
DefaultDirName={autopf}\MyBizOne
DefaultGroupName=MyBizOne
AllowNoIcons=yes
LicenseFile=..\..\LICENSE
OutputDir=output
OutputBaseFilename=MyBizOne-Setup-{#AppVersion}
SetupIconFile=assets\icon.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startupicon"; Description: "Start MyBizOne automatically when Windows starts"; GroupDescription: "Startup:"

[Files]
; Next.js standalone app
Source: "..\..\..\apps\web\.next\standalone\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs
; Go launcher binary
Source: "mybizonelaunch.exe"; DestDir: "{app}"; Flags: ignoreversion
; Portable PostgreSQL (bundled separately — not in this repo)
Source: "portable-pg\*"; DestDir: "{app}\pgsql"; Flags: ignoreversion recursesubdirs createallsubdirs; Check: DirExists(ExpandConstant('{src}\portable-pg'))
; Portable Node.js
Source: "portable-node\*"; DestDir: "{app}\node"; Flags: ignoreversion recursesubdirs createallsubdirs; Check: DirExists(ExpandConstant('{src}\portable-node'))

[Icons]
Name: "{group}\MyBizOne"; Filename: "{app}\mybizonelaunch.exe"
Name: "{group}\{cm:UninstallProgram,MyBizOne}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\MyBizOne"; Filename: "{app}\mybizonelaunch.exe"; Tasks: desktopicon
Name: "{userstartup}\MyBizOne"; Filename: "{app}\mybizonelaunch.exe"; Parameters: "--minimized"; Tasks: startupicon

[Run]
Filename: "{app}\mybizonelaunch.exe"; Description: "{cm:LaunchProgram,MyBizOne}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\logs"

[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
end;
