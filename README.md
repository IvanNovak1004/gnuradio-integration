# GNURadio Integration
![icon](./imgs/gnuradio-integration-icon.png)

An extension to help you manipulate GNURadio Companion files in VSCode. Adds support for "`.grc`" files.

![preview](./imgs/preview.png)

## Command palette

- **Open GNURadio Companion** - open GNURadio Companion application.

## Explorer context menu

- **Edit In GNURadio Companion** - edit the selected GRC flowgraph file in GNURadio Companion application;
- **Compile Flowgraph** - compile the selected GRC flowgraph file;
- **Compile and Run Flowgraph** - compile and run the selected GRC flowgraph file.

**Warning!** Compilation will overwite the target file without confirmation!

## Extension settings

- **GNURadio Companion command** (default: `gnuradio-companion`);
- **GNURadio CLI compiler command** (default: `grcc`).
