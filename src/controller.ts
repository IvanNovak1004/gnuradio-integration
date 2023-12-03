'use strict';

import * as vscode from 'vscode';
import { promisify } from 'util';
import { ExecOptions, exec as cp_exec } from 'child_process';
import { dirname, extname, basename, resolve } from 'path';
import { existsSync, readdirSync } from 'fs';
import { MultiStepInput } from './multiStepInput';
const exec = promisify(cp_exec);

export class GNURadioController {
    private context: vscode.ExtensionContext;
    private _outputChannel: vscode.OutputChannel;
    private cwd?: string;
    private moduleName?: string;
    public readonly extId: string;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this._outputChannel = vscode.window.createOutputChannel(context.extension.packageJSON.displayName);
        this.extId = context.extension.packageJSON.name;

        const ws = vscode.workspace.workspaceFolders;
        if (!ws) {
            this.setCwd();
            return;
        }
        this.setCwd(ws[0].uri.fsPath);
        // } else if (ws.length > 1) {
        //     vscode.window.showErrorMessage("Multi-root workspace detected, what's the cwd?");
        //     return undefined;
        // }

        if (vscode.workspace.getConfiguration().get(`${this.extId}.modtool.checkXml`) === true) {
            this.checkXml();
        }
    }

    public setCwd(cwd?: string) {
        this.cwd = cwd;
        this.moduleName = undefined;
        this.getModuleInfo().then((info) => {
            let moduleFound = false;
            if (info) {
                moduleFound = true;
                this.moduleName = info['modname'];
                // TODO: base_dir !== this.cwd
            }
            vscode.commands.executeCommand('setContext', 'gnuradio-integration.moduleFound', moduleFound);
        });
    }

    public async checkXml() {
        if (!this.cwd) {
            return;
        }
        const xmlBlocks = readdirSync(resolve(this.cwd!, 'grc'))
            .filter((filename) => extname(filename) === '.xml');
        vscode.commands.executeCommand('setContext', 'gnuradio-integration.xmlFound', xmlBlocks.length > 0);
        if (xmlBlocks.length > 0) {
            const updateAll = await vscode.window.showInformationMessage('XML block definitions found. Update them to YAML?', 'Yes', 'No');
            if (updateAll === 'Yes') {
                await this.exec(`${this.modtool()} update --complete`);
                vscode.window.showInformationMessage(`Block definitions written to "grc/". Checking for XML on startup can be disabled in extension settings.`);
                vscode.commands.executeCommand('setContext', 'gnuradio-integration.xmlFound', false);
            } else {
                vscode.window.showInformationMessage(`Checking for XML on startup can be disabled in extension settings.`);
            }
        }
    }

    private grc() {
        return vscode.workspace.getConfiguration().get(`${this.extId}.companion.cmd`);
    }

    private grcc() {
        return vscode.workspace.getConfiguration().get(`${this.extId}.compiler.cmd`);
    }

    private modtool() {
        return vscode.workspace.getConfiguration().get(`${this.extId}.modtool.cmd`);
    }

    private print(value: string) {
        this._outputChannel.appendLine(value);
    }

    private exec(cmd: string, options: ExecOptions & {
        successMessage?: string | undefined,
        stdoutPath?: string | undefined,
    } = {}) {
        if (!options.cwd) {
            options.cwd = this.cwd;
        }
        //this._outputChannel.show(true);
        this.print(`[Running] ${cmd}`);
        const proc = exec(cmd, options);
        proc.child.stdout?.on('data', (data) => this.print(`${data}`));
        proc.child.stderr?.on('data', (data) => this.print(`${data}`));
        if (options.successMessage) {
            proc.child.on('close', () => {
                this.print(`[Done] ${options.successMessage}`);
                vscode.window.showInformationMessage(options.successMessage!);
            });
        }
        proc.child.on('error', (err) => {
            this.print(`[Error] ${proc.child.stderr?.toString()}`);
            vscode.window.showErrorMessage(err.toString());
        });
        return proc;
    }

    private async execOnFile(cmd: string, fileUri?: vscode.Uri, options: ExecOptions & {
        successMessage?: string | undefined,
        stdoutPath?: string | undefined,
        fileExtension?: string | undefined,
    } = {}) {
        if (fileUri === undefined) {
            return vscode.window.showErrorMessage("File required");
        }
        let stat = await vscode.workspace.fs.stat(fileUri);
        switch (stat.type) {
            case vscode.FileType.File:
                break;
            case vscode.FileType.Directory:
                return vscode.window.showErrorMessage("File required, but folder was provided");
            case vscode.FileType.SymbolicLink:
                return vscode.window.showErrorMessage("File required, but symlink was provided");
            default:
                throw Error("File required, but something else was provided");
        }
        let path = fileUri.fsPath;
        if (options.fileExtension && extname(path) !== options.fileExtension) {
            // FIXME: Is this a sanity check?
            return vscode.window.showErrorMessage(`Expected file extension "${options.fileExtension}", but found "${extname(path)}"`);
        }
        if (!options.cwd) {
            options.cwd = dirname(path);
        }
        return this.exec(`${cmd} "${path}"`, options);
    }

    /** 
     * Open GNURadio Companion application.
     * 
     * This command runs `gnuradio-companion` in the shell.
     */
    public async openGnuradioCompanion() {
        return this.exec(`"${this.grc()}"`);
    }

    /** 
     * Edit the file in GNURadio Companion application.
     * 
     * This command runs `gnuradio-companion %f` in the shell, opening the selected file `%f`.
     */
    public async editInGnuradioCompanion(fileUri?: vscode.Uri) {
        return this.execOnFile(`"${this.grc()}"`, fileUri, { fileExtension: '.grc' });
    }

    /**
     * Compile the GRC flowgraph file.
     * 
     * This command runs `grcc %f` in the shell, producing a Python executable in the same folder as the selected file `%f`.
     */
    public async compileFlowgraph(fileUri?: vscode.Uri) {
        return this.execOnFile(`"${this.grcc()}"`, fileUri, { fileExtension: '.grc' });
    }

    /**
     * Run the GRC flowgraph file.
     * 
     * This command runs `grcc -r %f` in the shell, producing a Python executable in the same folder as the selected file `%f` and running it.
     */
    public async runFlowgraph(fileUri?: vscode.Uri) {
        return this.execOnFile(`"${this.grcc()}" -r`, fileUri, {
            successMessage: `Compiled to "${fileUri?.fsPath.replace(/".grc$"/, ".py")}" successfully`,
            fileExtension: '.grc',
        });
    }

    /**
     * Create a new OOT module project.
     * 
     * This command runs `gr_modtool newmod %name` in the shell, creating a new CMake project and opening the created folder. 
     */
    public async createModule() {
        try {
            const newmodName = await vscode.window.showInputBox({
                title: 'GNURadio: New OOT Module',
                placeHolder: 'Enter Module Name...',
                validateInput(value) {
                    let name = value.trim();
                    if (!name.length) {
                        return {
                            message: 'Name cannot be empty',
                            severity: vscode.InputBoxValidationSeverity.Error,
                        };
                    }
                    if (!/^([\w,\_,\-,\.]+)$/.test(name)) {
                        return {
                            message: 'Name can only contain ASCII letters, digits, and the characters . - _',
                            severity: vscode.InputBoxValidationSeverity.Error,
                        };
                    }
                    if (name.length < 3) {
                        return {
                            message: 'Descriptive names usually contain at least 3 symbols',
                            severity: vscode.InputBoxValidationSeverity.Warning,
                            then: null,
                        };
                    }
                },
            });
            if (!newmodName) {
                throw Error('No valid name provided');
            }
            const parentDir = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                title: 'Create module in directory'
            }).then(
                (value) => value && value.length ? value[0].fsPath : undefined,
                () => undefined,
            );
            if (!parentDir) {
                throw Error('No directory provided');
            }
            const newmodPath = resolve(parentDir, `gr-${newmodName}`);
            if (existsSync(newmodPath)) {
                throw Error('Directory already exists');
            }
            await this.exec(`"${this.modtool()}" newmod ${newmodName}`, { cwd: parentDir });
            return vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(newmodPath));
        } catch (err) {
            if (err instanceof Error) {
                return vscode.window.showErrorMessage(err.message);
            }
        }
    }

    public async getModuleInfo() {
        try {
            if (!this.cwd) {
                throw Error("No module detected in the open workspace");
            }
            let { stdout: moduleInfoStr, stderr: _ } = await this.exec(`"${this.modtool()}" info --python-readable`);
            return JSON.parse(moduleInfoStr.slice(0, -1).replace(/\'/g, '"'));
        } catch (err) {
            if (err instanceof Error) {
                return vscode.window.showErrorMessage(err.message);
            }
        }
    }

    /**
     * Create a new block in the OOT module.
     * 
     * This command runs `gr_modtool add` in the shell, creating source files and including them into CMakeLists.
     * 
     * TODO: Create an HTML form instead of a multi-step input box
     */
    public async createBlock() {
        try {
            const grcBlocks = readdirSync(resolve(this.cwd!, 'grc'))
                .filter((filename) => extname(filename) === '.block.yml')
                .map((filename) => filename.slice(this.moduleName!.length + 1, -10));
            const cppBlocks = readdirSync(resolve(this.cwd!, 'include', 'gnuradio', this.moduleName!))
                .filter((filename) => extname(filename) === '.h' && filename !== 'api.h')
                .map((filename) => filename.slice(0, -2));
            const pyBlocks = readdirSync(resolve(this.cwd!, 'python', this.moduleName!))
                .filter((filename) => extname(filename) === '.py' && filename !== '__init__.py' && !filename.startsWith('qa_'))
                .map((filename) => filename.slice(0, -3));
            const blocks = new Set([...grcBlocks, ...cppBlocks, ...pyBlocks]);

            async function validateName(value: string) {
                let name = value.trim();
                if (!name.length) {
                    return 'Name cannot be empty';
                }
                if (!/^([\w,\_]+)$/.test(name)) {
                    return 'Name can only contain ASCII letters, digits and underscores';
                }
                // if (name.length < 3) {
                //     return {
                //         message: 'Descriptive names usually contain at least 3 symbols',
                //         severity: vscode.InputBoxValidationSeverity.Warning,
                //         then: null,
                //     };
                // }
                if (blocks.has(name)) {
                    return 'Block with that name is already present';
                }
                return undefined;
            }

            interface State {
                title: string;
                step: number;
                totalSteps: number;
                copyright?: string;
                name?: string;
                blockType?: vscode.QuickPickItem;
                language?: vscode.QuickPickItem;
                addCppTest?: string;
                addPythonTest?: string;
                finished: boolean;
            }

            async function inputAuthor(input: MultiStepInput, state: State) {
                // TODO: Remember current value when navigating back.
                state.copyright = await input.showInputBox({
                    title: state.title,
                    step: 1,
                    totalSteps: state.totalSteps,
                    value: state.copyright || '',
                    prompt: 'Please specify the copyright holder',
                    validate: async () => undefined,
                    shouldResume: async () => false,
                });
                return (input: MultiStepInput) => inputName(input, state);
            }

            async function inputName(input: MultiStepInput, state: State) {
                // TODO: Remember current value when navigating back.
                state.name = await input.showInputBox({
                    title: state.title,
                    step: 2,
                    totalSteps: state.totalSteps,
                    value: state.name || '',
                    prompt: 'Choose a unique name for the block',
                    validate: validateName,
                    shouldResume: async () => false,
                });
                return (input: MultiStepInput) => pickBlockType(input, state);
            }

            async function pickBlockType(input: MultiStepInput, state: State) {
                const pick = await input.showQuickPick({
                    title: state.title,
                    step: 3,
                    totalSteps: state.totalSteps,
                    placeholder: 'Pick block type',
                    items: [
                        { label: 'general', description: 'gr::block', detail: 'General-purpose block type' },
                        { label: 'sync', description: 'gr::sync_block', detail: 'Block with synchronous 1:1 input-to-output' },
                        { label: 'decimator', description: 'gr::sync_decimator', detail: 'Block with synchronous N:1 input-to-output' },
                        { label: 'interpolator', description: 'gr::sync_interpolator', detail: 'Block with synchronous N:1 input-to-output' },
                        { label: 'source', description: 'gr::sync_block', detail: 'Source block with outputs, but no stream inputs' },
                        { label: 'sink', description: 'gr::sync_block', detail: 'Sink block with inputs, but no stream outputs' },
                        { label: 'tagged_stream', description: 'gr::tagged_stream_block', detail: 'Block with input-to-output flow controlled by input stream tags (e.g. packetized streams)' },
                        { label: 'hier', description: 'gr::hier_block2', detail: 'Hierarchical container block for other blocks; usually can be described by a flowgraph' },
                        { label: 'noblock', detail: 'C++ or Python class' },
                    ],
                    activeItem: state.blockType,
                    shouldResume: async () => false,
                });
                state.blockType = pick[0];
                // state.totalSteps = state.blockType.label === 'noblock' ? 4 : 5;
                return (input: MultiStepInput) => pickLanguage(input, state);
            }

            async function pickLanguage(input: MultiStepInput, state: State) {
                const pick = await input.showQuickPick({
                    title: state.title,
                    step: 4,
                    totalSteps: state.totalSteps,
                    placeholder: 'Pick implementation language',
                    items: [
                        { label: 'Python', description: 'python', iconClass: ['file-icon', 'python-lang-file-icon'] },
                        { label: 'C++', description: 'cpp', iconClass: 'cpp-lang-file-icon' },
                    ],
                    activeItem: state.language,
                    shouldResume: async () => false,
                });
                state.language = pick[0];
                // if (state.blockType?.label === 'noblock' && state.language.label.includes('Python')) {
                state.finished = true;
                //     return;
                // }
                // return (input: MultiStepInput) => pickTests(input, state);
            }

            // async function pickTests(input: MultiStepInput, state: State) {
            //     let testLanguages: vscode.QuickPickItem[] = [];
            //     if (state.blockType?.label !== 'noblock') {
            //         testLanguages.push({ label: 'Python', description: 'python' });
            //     }
            //     if (state.language?.label.includes('C++')) {
            //         testLanguages.push({ label: 'C++', description: 'cpp' });
            //     }
            //     const picks = await input.showQuickPick({
            //         title: state.title,
            //         step: 5,
            //         totalSteps: 5,
            //         placeholder: 'Add QA code',
            //         items: testLanguages,
            //         canSelectMany: true,
            //         shouldResume: async () => false,
            //     });
            //     for (var pick of picks) {
            //         if (pick.description === 'cpp') {
            //             state.addCppTest = '--add-cpp-qa';
            //         } else if (pick.description === 'python') {
            //             state.addPythonTest = '--add-python-qa';
            //         }
            //     }
            //     state.finished = true;
            // }

            // TODO: `gr_modtool add` requires --add-cpp-qa and/or --add-python-qa

            // TODO: Arguments?

            let state = <State>{ title: 'GNURadio: Create Block', totalSteps: 4, finished: false };
            await MultiStepInput.run(input => inputAuthor(input, state));
            if (!state.finished) {
                return;
            }

            await this.exec(`"${this.modtool()}" add ${state.name} --copyright ${state.copyright ?? ''} --block-type ${state.blockType!.label} --lang ${state.language!.description} --add-cpp-qa --add-python-qa --argument-list ""`);
            // ${state.addCppTest ?? ''} ${state.addPythonTest ?? ''}
            const blockPath = state.language!.description === 'python'
                ? resolve(this.cwd!, 'python', this.moduleName!, `${state.name}.py`)
                : resolve(this.cwd!, 'include', 'gnuradio', this.moduleName!, `${state.name}.h`);
            return vscode.commands.executeCommand('vscode.open', vscode.Uri.file(blockPath));
        } catch (err) {
            if (err instanceof Error) {
                return vscode.window.showErrorMessage(err.message);
            }
        }
    }

    public async createPythonBindings(fileUri?: vscode.Uri) {
        try {
            let blockName: string | undefined;
            if (!fileUri) {
                const headers = readdirSync(resolve(this.cwd!, 'include', 'gnuradio', this.moduleName!))
                    .filter((filename) => extname(filename) === '.h' && basename(filename) !== 'api.h')
                    .map((filename) => filename.slice(0, -2));
                blockName = await vscode.window.showQuickPick(headers, {
                    title: 'GNURadio: Python Bindings',
                    placeHolder: 'Enter block name...',  // TODO: Regular expression (python-bridge?)
                    canPickMany: false,
                });
            } else if (extname(fileUri.fsPath) !== '.h') {
                throw Error(`Invalid file type: expected a header (.h), found ${extname(fileUri.fsPath)}`);
            } else {
                blockName = basename(fileUri.fsPath).slice(0, -2);
            }
            if (!blockName) {
                throw Error('No block name provided');
            }
            await this.exec(`"${this.modtool()}" bind ${blockName}`);
            return vscode.window.showInformationMessage(`Python bindings written to "python/${this.moduleName!}/bindings/${blockName}_python.cc"`);
        } catch (err) {
            if (err instanceof Error) {
                return vscode.window.showErrorMessage(err.message);
            }
        }
    }

    public async disableBlock(blockName?: string) {
        try {
            if (!blockName) {
                // TODO: Read CMakeLists.txt?
                const grcBlocks = readdirSync(resolve(this.cwd!, 'grc'))
                    .filter((filename) => extname(filename) === '.block.yml')
                    .map((filename) => filename.slice(this.moduleName!.length + 1, -10));
                const cppBlocks = readdirSync(resolve(this.cwd!, 'include', 'gnuradio', this.moduleName!))
                    .filter((filename) => extname(filename) === '.h' && filename !== 'api.h')
                    .map((filename) => filename.slice(0, -2));
                const pyBlocks = readdirSync(resolve(this.cwd!, 'python', this.moduleName!))
                    .filter((filename) => extname(filename) === '.py' && filename !== '__init__.py' && !filename.startsWith('qa_'))
                    .map((filename) => filename.slice(0, -3));
                const blocks = Array.from(new Set([...grcBlocks, ...cppBlocks, ...pyBlocks]));
                blockName = await vscode.window.showQuickPick(blocks, {
                    title: 'GNURadio: Disable Block',
                    placeHolder: 'Enter block name...',
                    canPickMany: false,
                });
            }
            if (!blockName) {
                throw Error('No block name provided');
            }
            // TODO: show files to be disabled?
            const confirm = await vscode.window.showWarningMessage(`Are you sure you want to disable "${blockName}"?`, { modal: true }, "Yes");
            if (confirm === 'Yes') {
                await this.exec(`"${this.modtool()}" disable ${blockName}`);
                return vscode.window.showInformationMessage(`Block "${blockName}" was disabled`);
            }
        } catch (err) {
            if (err instanceof Error) {
                return vscode.window.showErrorMessage(err.message);
            }
        }
    }

    public async removeBlock(blockName?: string) {
        try {
            if (!blockName) {
                // TODO: Read CMakeLists.txt?
                const grcBlocks = readdirSync(resolve(this.cwd!, 'grc'))
                    .filter((filename) => extname(filename) === '.block.yml')
                    .map((filename) => filename.slice(this.moduleName!.length + 1, -10));
                const cppBlocks = readdirSync(resolve(this.cwd!, 'include', 'gnuradio', this.moduleName!))
                    .filter((filename) => extname(filename) === '.h' && filename !== 'api.h' && !filename.startsWith('qa_'))
                    .map((filename) => filename.slice(0, -2));
                const pyBlocks = readdirSync(resolve(this.cwd!, 'python', this.moduleName!))
                    .filter((filename) => extname(filename) === '.py' && filename !== '__init__.py' && !filename.startsWith('qa_'))
                    .map((filename) => filename.slice(0, -3));
                const blocks = Array.from(new Set([...grcBlocks, ...cppBlocks, ...pyBlocks]));
                blockName = await vscode.window.showQuickPick(blocks, {
                    title: 'GNURadio: Remove Block',
                    placeHolder: 'Enter block name...',
                    canPickMany: false,
                });
            }
            if (!blockName) {
                throw Error('No block name provided');
            }
            // TODO: show files to be removed?
            const confirm = await vscode.window.showWarningMessage(`Are you sure you want to remove "${blockName}"?`, { modal: true }, "Yes");
            if (confirm === 'Yes') {
                await this.exec(`"${this.modtool()}" rm ${blockName} -y`);
                return vscode.window.showInformationMessage(`Block "${blockName}" was removed`);
            }
        } catch (err) {
            if (err instanceof Error) {
                return vscode.window.showErrorMessage(err.message);
            }
        }
    }

    public async renameBlock(blockName?: string) {
        try {
            if (!blockName) {
                // TODO: Read CMakeLists.txt?
                const grcBlocks = readdirSync(resolve(this.cwd!, 'grc'))
                    .filter((filename) => extname(filename) === '.block.yml')
                    .map((filename) => filename.slice(this.moduleName!.length + 1, -10));
                const cppBlocks = readdirSync(resolve(this.cwd!, 'include', 'gnuradio', this.moduleName!))
                    .filter((filename) => extname(filename) === '.h' && filename !== 'api.h')
                    .map((filename) => filename.slice(0, -2));
                const pyBlocks = readdirSync(resolve(this.cwd!, 'python', this.moduleName!))
                    .filter((filename) => extname(filename) === '.py' && filename !== '__init__.py' && !filename.startsWith('qa_'))
                    .map((filename) => filename.slice(0, -3));
                const blocks = Array.from(new Set([...grcBlocks, ...cppBlocks, ...pyBlocks]));
                blockName = await vscode.window.showQuickPick(blocks, {
                    title: 'GNURadio: Rename Block',
                    placeHolder: 'Enter block name...',
                    canPickMany: false,
                });
            }
            if (!blockName) {
                throw Error('No block name provided');
            }
            const newBlockName = await vscode.window.showInputBox({
                title: `GNURadio: Rename "${blockName}"`,
                placeHolder: 'Enter new block name...',
                validateInput(value) {
                    let name = value.trim();
                    if (!name.length) {
                        return {
                            message: 'Name cannot be empty',
                            severity: vscode.InputBoxValidationSeverity.Error,
                        };
                    }
                    if (!/^([\w,\_]+)$/.test(name)) {
                        return {
                            message: 'Name can only contain ASCII letters, digits and underscores',
                            severity: vscode.InputBoxValidationSeverity.Error,
                        };
                    }
                    if (name.length < 3) {
                        return {
                            message: 'Descriptive names usually contain at least 3 symbols',
                            severity: vscode.InputBoxValidationSeverity.Warning,
                            then: null,
                        };
                    }
                },
            });
            if (!newBlockName) {
                throw Error('No valid name provided');
            }
            // TODO: show files to be renamed?
            await this.exec(`"${this.modtool()}" rename ${blockName} ${newBlockName}`);
            return vscode.window.showInformationMessage(`Block "${blockName}" was renamed to "${newBlockName}"`);
        } catch (err) {
            if (err instanceof Error) {
                return vscode.window.showErrorMessage(err.message);
            }
        }
    }

    public async convertXmlToYaml(fileUri?: vscode.Uri) {
        try {
            const modNameLength = this.moduleName!.length + 1;
            let blockName: string | undefined;
            if (!fileUri) {
                const xmlBlocks = readdirSync(resolve(this.cwd!, 'grc'))
                    .filter((filename) => extname(filename) === '.xml')
                    .map((filename) => filename.slice(modNameLength, -4));
                if (xmlBlocks.length === 0) {
                    return vscode.window.showInformationMessage('No XML found, no need to update!');
                }
                blockName = await vscode.window.showQuickPick(xmlBlocks, {
                    title: 'GNURadio: Convert XML to YAML',
                    placeHolder: 'Enter block name...',
                    canPickMany: false,
                });
            } else if (extname(fileUri.fsPath) !== '.xml') {
                throw Error(`Invalid file type: expected XML, found ${extname(fileUri.fsPath)}`);
            } else {
                blockName = basename(fileUri.fsPath).slice(modNameLength, -4);
            }
            if (!blockName) {
                const updateAll = await vscode.window.showWarningMessage('No block name provided! Update all definitions?', 'Yes', 'No');
                if (updateAll === 'Yes') {
                    await this.exec(`${this.modtool()} update --complete`);
                    return vscode.window.showInformationMessage(`Block definitions written to "grc/"`);
                }
                return;
            }
            await this.exec(`"${this.modtool()}" update ${blockName}`);
            return vscode.window.showInformationMessage(`Block definition written to "grc/${this.moduleName!}_${blockName}.block.yml"`);
        } catch (err) {
            if (err instanceof Error) {
                return vscode.window.showErrorMessage(err.message);
            }
        }
    }

    public async makeYamlFromImpl(fileUri?: vscode.Uri) {
        try {
            let blockName: string | undefined;
            if (!fileUri) {
                const cppBlocks = readdirSync(resolve(this.cwd!, 'lib'))
                    .filter((filename) => filename.endsWith('_impl.cc'))
                    .map((filename) => filename.slice(0, -8));
                if (cppBlocks.length === 0) {
                    return vscode.window.showInformationMessage('No C++ blocks found');
                }
                blockName = await vscode.window.showQuickPick(cppBlocks, {
                    title: 'GNURadio: Make YAML from implementation',
                    placeHolder: 'Enter block name...',
                    canPickMany: false,
                });
            } else if (!(fileUri.fsPath.endsWith('_impl.cc') || fileUri.fsPath.endsWith('_impl.cpp') || fileUri.fsPath.endsWith('_impl.cxx'))) {
                throw Error(`Invalid file type: expected C++ source, found ${basename(fileUri.fsPath)}`);
            } else {
                blockName = basename(fileUri.fsPath).slice(0, -8);
            }
            if (!blockName) {
                throw Error('No block name provided');
            }
            await this.exec(`"${this.modtool()}" makeyaml ${blockName}`);
            return vscode.window.showInformationMessage(`Block definition written to "grc/${this.moduleName!}_${blockName}.block.yml"`);
        } catch (err) {
            if (err instanceof Error) {
                return vscode.window.showErrorMessage(err.message);
            }
        }
    }
}