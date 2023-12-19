/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickPickItem, window, Disposable, QuickInputButton, QuickInput, QuickInputButtons, InputBoxOptions, QuickPickOptions, InputBoxValidationSeverity } from 'vscode';

// -------------------------------------------------------
// Helper code that wraps the API for the multi-step case.
// -------------------------------------------------------


class InputFlowAction {
	static back = new InputFlowAction();
	static cancel = new InputFlowAction();
	static resume = new InputFlowAction();
}

type InputStep = (input: MultiStepInput) => Thenable<InputStep | void>;

export class MultiStepInput {

	static async run(start: InputStep) {
		const input = new MultiStepInput();
		return input.stepThrough(start);
	}

	private current?: QuickInput;
	private steps: InputStep[] = [];

	private async stepThrough(start: InputStep) {
		let step: InputStep | void = start;
		while (step) {
			this.steps.push(step);
			if (this.current) {
				this.current.enabled = false;
				this.current.busy = true;
			}
			try {
				step = await step(this);
			} catch (err) {
				if (err === InputFlowAction.back) {
					this.steps.pop();
					step = this.steps.pop();
				} else if (err === InputFlowAction.resume) {
					step = this.steps.pop();
				} else if (err === InputFlowAction.cancel) {
					step = undefined;
				} else {
					throw err;
				}
			}
		}
		if (this.current) {
			this.current.dispose();
		}
	}

	async showQuickPick<T extends QuickPickItem>(items: T[], options: QuickPickOptions & { step: number, totalSteps: number, activeItem?: T, buttons?: QuickInputButton[], shouldResume?: () => Thenable<boolean> }) {
		const disposables: Disposable[] = [];
		try {
			return await new Promise<T[]>((resolve, reject) => {
				const input = window.createQuickPick<T>();
				input.title = options.title;
				input.step = options.step;
				input.totalSteps = options.totalSteps;
				input.ignoreFocusOut = options.ignoreFocusOut ?? false;
				input.canSelectMany = options.canPickMany ?? false;
				input.placeholder = options.placeHolder;
				input.items = items;
				if (options.activeItem) {
					input.activeItems = [options.activeItem];
				}
				input.buttons = this.steps.length > 1 ? [QuickInputButtons.Back] : [];
				disposables.push(
					input.onDidTriggerButton(item => {
						if (item === QuickInputButtons.Back) {
							reject(InputFlowAction.back);
						} else {
							resolve(<any>item);
						}
					}),
					input.onDidHide(() => {
						(async () => {
							reject(options.shouldResume && await options.shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
						})()
							.catch(reject);
					}),
					input.onDidAccept(() => {
						if (input.step === input.totalSteps) {
							resolve(Array.from(input.selectedItems));
						}
					}),
				);
				if (!input.canSelectMany) {
					disposables.push(
						input.onDidChangeSelection(items => resolve([...items])),
					);
				}
				if (this.current) {
					this.current.dispose();
				}
				this.current = input;
				this.current.show();
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}

	async showInputBox(options: InputBoxOptions & { step: number, totalSteps: number, buttons?: QuickInputButton[], shouldResume?: () => Thenable<boolean> }) {
		const disposables: Disposable[] = [];
		try {
			return await new Promise<string>((resolve, reject) => {
				const input = window.createInputBox();
				input.title = options.title;
				input.step = options.step;
				input.totalSteps = options.totalSteps;
				input.value = options.value || '';
				input.prompt = options.prompt;
				input.ignoreFocusOut = options.ignoreFocusOut ?? false;
				input.placeholder = options.placeHolder;
				input.buttons = [
					...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
					...(options.buttons || [])
				];
				let validating = options.validateInput ? options.validateInput('') : undefined;
				disposables.push(
					input.onDidTriggerButton(item => {
						if (item === QuickInputButtons.Back) {
							reject(InputFlowAction.back);
						} else {
							resolve(<any>item);
						}
					}),
					input.onDidAccept(async () => {
						const value = input.value;
						input.enabled = false;
						input.busy = true;
						const validationMessage = await validating;
						if (!(validationMessage && typeof validationMessage === 'object' &&
							validationMessage.severity === InputBoxValidationSeverity.Error)) {
							resolve(value);
						}
						input.enabled = true;
						input.busy = false;
					}),
					input.onDidChangeValue(async text => {
						if (!options.validateInput) {
							return;
						}
						const current = options.validateInput(text);
						validating = current;
						const validationMessage = await current;
						if (current === validating) {
							input.validationMessage = validationMessage ?? undefined;
						}
					}),
					input.onDidHide(() => {
						(async () => {
							reject(options.shouldResume && await options.shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
						})()
							.catch(reject);
					})
				);
				if (this.current) {
					this.current.dispose();
				}
				this.current = input;
				this.current.show();
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}
}
