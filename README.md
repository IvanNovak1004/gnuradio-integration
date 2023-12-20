# GNURadio Integration
![icon](./imgs/gnuradio-integration-icon.png)

An extension to help you with work with [GNURadio](https://www.gnuradio.org) in VSCode.

Features:
- Opening and compiling GRC Flowgraph files (`.grc`)
- Browsing the OOT module to see all blocks and the corresponding files
- Manipulating the OOT module with `gr_modtool`

## OOT Module Explorer
If a GNURadio OOT module is detected in the workspace, the **GNURadio Module** tree view will appear in the Explorer container. All blocks within that module are presented with the corresponding files: YAML GRC block definition, Python implementation for Python blocks, C++ header and implementation for C++ blocks, Python and C++ QA (unit testing) source files.

![Module view, block context menu](./imgs/module_tree.png) ![Module view, file context menu](./imgs/module_tree_contextmenu.png)

## Commands
- **GNURadio Companion:**;
    - **Open the application**;
    - **Edit Flowgraph** - edit the selected GRC flowgraph file in GNURadio Companion application;
- **GNURadio Compiler**:
    - **Compile Flowgraph** ⚠️ - compile the selected GRC flowgraph file;
    - **Compile and Run Flowgraph** ⚠️ - compile and run the selected GRC flowgraph file.
- **GNURadio Module**:
    - **Create OOT Module**;
    - **Create Block**;
    - **Create Python Bindings** ⚠️ 🪣 - generate pybind11 code based on the block's C++ header;
    - **Rename Block**;
    - **Remove Blocks** 🪣;
    - **Convert XML to YAML** ⚠️ - convert old XML block definitions to YAML.
- **GNURadio Module View: Refresh**.

**Warning!** Commands marked with ⚠️ will overwite target files without confirmation!

## Command palette
![Command palette](./imgs/command_palette.png)

**WIP**: Commands marked with 🪣 can use regular expressions to process multiple blocks at once. Picking the "Regular expression" option selects all blocks with names containing the fragment and any symbols before and after it (uses `.*{input}.*` when `{input}` is entered).
![Regular expressions](./imgs/modtool_regex.png)

## Explorer context menu
| Flowgraph | C++ block header | XML block definition |
|-|-|-|
| ![Flowgraph](./imgs/flowgraph.png) | ![C++ block header](./imgs/create_bindings.png) | ![XML block definition](./imgs/convert_xml.png) |

## Editor title bar
| Flowgraph |
|-|
| ![Edit or Compile/Run Flowgraph](./imgs/flowgraph_edit.png) |

## Extension settings
- **GNURadio Companion command** (default: `gnuradio-companion`);
- **GNURadio CLI compiler command** (default: `grcc`);
- **Check for XML block definitions** on startup (default: disabled).
