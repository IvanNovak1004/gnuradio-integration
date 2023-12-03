# GNURadio Integration
![icon](./imgs/gnuradio-integration-icon.png)

An extension to help you with work with GNURadio in VSCode.
- Context menu actions for opening and compiling "`.grc`" files
- Commands for manipulating the OOT module with `gr_modtool`

## Command palette
![Command palette](./imgs/command_palette.png)
- **GNURadio Companion: Open the application**;
- **GNURadio Module**:
    - **Create OOT Module**;
    - **Create Block**;
    - **Create Python Bindings**;
    - **Rename Block**;
    - **Remove Block**;
    - **Convert XML to YAML**.

## Explorer context menu
- [Flowgraph](./imgs/flowgraph.png):
    - **Edit In GNURadio Companion** - edit the selected GRC flowgraph file in GNURadio Companion application;
    - **Compile Flowgraph** - compile the selected GRC flowgraph file;
    - **Compile and Run Flowgraph** - compile and run the selected GRC flowgraph file.
- [Header](./imgs/create_bindings.png):
    - **Create Python Bindings** - generate pybind11 code based on the block's C++ header;
- [XML](./imgs/convert_xml.png):
    - **Convert XML to YAML** - convert old XML block definitions to YAML.

**Warning!** Compilation will overwite the target file without confirmation!

## Extension settings
- **GNURadio Companion command** (default: `gnuradio-companion`);
- **GNURadio CLI compiler command** (default: `grcc`);
- **GNURadio modtool command** (default: `gr_modtool`);
- **Check for XML block definitions** (default: disabled).
