# Change Log

All notable changes to the "gnuradio-integration" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]
### Added
- Added GNURadio Module view to the Explorer panel
- Added actions in the module view to refresh view and create blocks
- Added opening the file on click in the module view
- Added actions on a block in the module view (context menu):
  - Create Python Bindings;
  - Rename Block;
  - Remove Block.

### Fixed
- Fixed rename not checking for uniqueness of a new name

## [0.2.2] - 2023-12-11
### Added
- Added custom modtool wrapper scripts and `python-shell` dependency
- Added a command to manually query module info (`gr_modtool info`): 
a workaround to activate the extension when the module has no blocks yet
- Added actions to compile/run GRC Flowgraph files or edit them in GNURadio Companion from the editor titlebar
- Added a filter (regex) when creating Python bindings, making YAML from implementation, disabling or removing blocks
- Added automatic blockname for modtool commands when a corresponding editor is in focus
- Added an option to pick Python/C++ QA when creating blocks

### Changed
- Replaced `child_process` with `python-shell` for modtool commands
- Replaced `child_process` with tasks for `gnuradio-companion` and `grcc`

### Fixed
- Fixed validation warning preventing the use of short names when creating blocks
- Fixed sanity checks when creating Python bindings or converting XML to YAML from the context menu
- Fixed GRC Flowgraph commands not executing on currently open files
- Fixed YAML block filter not working because of mismatched `extname` (`.yml` vs `.block.yml`)

### Removed
- Removed GNURadio modtool command from extension settings

## [0.2.1] - 2023-12-07
### Added
- Added automatic copyright value (`git config user.name`) when creating a block
- Added dependency on builtin Git extension for calling `git` properly
- Added "Don't Show Again" option to XML check notifications 
- Added icons in the language selection when creating blocks 

### Changed
- Raised VSCode engine dependency to ^1.81.0 for icons in QuickPickItems 

## [0.2.0] - 2023-12-03
### Added
- Added commands for manipulating the OOT module:
  - Create OOT Module;
  - Create Block;
  - Create Python Bindings;
  - Rename Block;
  - Remove Block;
  - Convert XML to YAML.
- Added module detection in the open workspace

## [0.1.3] - 2023-12-02
### Added
- Released VSIX package

## [0.1.2] - 2023-12-01
### Changed
- Changed author name in the fork

### Removed
- Removed "Open GNURadio Companion" command from the context menu; it is only available in the command palette now

### Fixed
- Fixed GNURadio Companion not being able to launch without an open file
- Fixed typos

## [0.1.1] - 2022-06-13
### Fixed
- Fixed the github repository name

## [0.1.0] - 2022-06-13
### Added
- This is the initial release of gnuradio-integration VS Code extension

[Unreleased]: https://github.com/AsriFox/gnuradio-integration/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/AsriFox/gnuradio-integration/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/AsriFox/gnuradio-integration/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/AsriFox/gnuradio-integration/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/AsriFox/gnuradio-integration/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/AsriFox/gnuradio-integration/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/IvanNovak1004/gnuradio-integration/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/IvanNovak1004/gnuradio-integration/releases/tag/v0.1.0
