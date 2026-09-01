; An-Nur Windows o'rnatuvchi
; Inno Setup 6 bilan kompilyatsiya: scripts\package-release.ps1

#ifndef AppVersion
#define AppVersion "0.1.0"
#endif

#ifndef StageDir
#define StageDir "dist\An-Nur-0.1.0"
#endif

[Setup]
AppId={{A7B3C9D1-4E5F-6A7B-8C9D-0E1F2A3B4C5D}
AppName=An-Nur
AppVersion={#AppVersion}
AppPublisher=An-Nur
DefaultDirName={localappdata}\An-Nur
DefaultGroupName=An-Nur
OutputDir=..\dist
OutputBaseFilename=An-Nur-{#AppVersion}-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\An-Nur"; Filename: "{app}\An-Nur-Ishga-Tushirish.cmd"; WorkingDir: "{app}"
Name: "{userdesktop}\An-Nur"; Filename: "{app}\An-Nur-Ishga-Tushirish.cmd"; WorkingDir: "{app}"
Name: "{group}\O'qish"; Filename: "{app}\OQISH.txt"

[Run]
Filename: "{app}\An-Nur-Ornatish.cmd"; Description: "O'rnatishni yakunlash"; Flags: postinstall skipifsilent

[Messages]
FinishedLabel=An-Nur o'rnatildi. Bosh ekrandagi yorliqni bosing yoki An-Nur-Ishga-Tushirish.cmd ni ishga tushiring.
