#ifndef AppVersion
  #error AppVersion is required
#endif

[Setup]
AppId={{5FAD072F-50A7-4600-A46F-6A91CC586AC0}
AppName=MyBizOne
AppVersion={#AppVersion}
DefaultDirName={localappdata}\Programs\MyBizOne
DefaultGroupName=MyBizOne
AllowNoIcons=yes
LicenseFile=..\..\..\dist\desktop\LICENSE.txt
OutputDir=output
OutputBaseFilename=MyBizOne-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startupicon"; Description: "Start MyBizOne when Windows starts"; GroupDescription: "Startup:"; Flags: unchecked

[Files]
; Required bundles: compilation fails if the complete application is absent.
Source: "..\..\..\dist\desktop\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\..\dist\desktop\mybizonelaunch.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\..\dist\desktop\postgres\*"; DestDir: "{app}\postgres"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\..\dist\desktop\node\*"; DestDir: "{app}\node"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\..\dist\desktop\LICENSE.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\MyBizOne"; Filename: "{app}\mybizonelaunch.exe"
Name: "{group}\{cm:UninstallProgram,MyBizOne}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\MyBizOne"; Filename: "{app}\mybizonelaunch.exe"; Tasks: desktopicon
Name: "{userstartup}\MyBizOne"; Filename: "{app}\mybizonelaunch.exe"; Parameters: "--minimized"; Tasks: startupicon

[Run]
Filename: "{app}\mybizonelaunch.exe"; Description: "{cm:LaunchProgram,MyBizOne}"; Flags: nowait postinstall skipifsilent

; Runtime-created config.json, data/, uploads/ and backups survive uninstall.
