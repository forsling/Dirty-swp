import * as vscode from 'vscode';
import * as ds from './display';
import { DsDocument, DsDocs, swpString, checkSwp, lockFile, emptyDocs } from './core';

const timeBetweenEditWarnings = 4000;
let swpStatusBar: vscode.StatusBarItem;
let active: boolean = true;

export function activate(context: vscode.ExtensionContext) {
	/**********************
	*  Handle settings
	***********************/
	active = vscode.workspace.getConfiguration().get('dirtyswp.startActive') || true;
	let statusBarEnabled = vscode.workspace.getConfiguration().get('dirtyswp.showStatusBarItem');

	/**********************
	*  Listeners
	***********************/
	let openDocumentListener = vscode.workspace.onDidOpenTextDocument(e => {
		if (!active || e.uri.scheme != "file") {
			return;
		}

		//Create DocumentInfo object and add it to documents
		let dsDoc = new DsDocument(e);
		DsDocs[e.uri.toString()] = dsDoc;

		//Warn user if file is being edited somewhere else
		checkSwp(dsDoc, (swp) => {
			ds.warn(dsDoc, false, swp);
		}, () => { });
		console.log(DsDocs);
	});
	context.subscriptions.push(openDocumentListener);

	let closeDocumentListener = vscode.workspace.onDidCloseTextDocument(e => {
		if (!active || e.uri.scheme != "file") {
			return;
		}

		let doc = DsDocs[e.uri.toString()];
		//If there is a swap file that we created, remove it on document close
		doc.removeOwnSwp();

		delete DsDocs[e.uri.toString()];
		console.log(DsDocs);
	});
	context.subscriptions.push(closeDocumentListener);

	let documentChangedListener = vscode.workspace.onDidChangeTextDocument(e => {
		if (!active || e.document.uri.scheme != "file") {
			return;
		}

		let dsDoc = DsDocs[e.document.uri.toString()];
		if (!dsDoc.textDocument.isDirty) {
			dsDoc.potentialUnsyncedChanges = false;
			//If file is no longer dirty, but still has our swp, 
			//then we can remove the .swp file (unless 'lock until close' is set)
			if (dsDoc.hasOurSwp && !dsDoc.forceLock) {
				dsDoc.removeOwnSwp();
			}
		}
		else if (!dsDoc.hasOurSwp) { 
			//File has unsaved changes but is not locked by us
			checkSwp(dsDoc, (swp) => {
				dsDoc.potentialUnsyncedChanges = true;
				ds.warn(dsDoc, true, swp);
			}, () => {
				if (dsDoc.potentialUnsyncedChanges) {
					//Even if the file is no longer in use by someone else, there may still be changes that have not been loaded (since file is dirty)
					vscode.window.showWarningMessage(
						dsDoc.basename + " is no longer being edited elsewhere but may have unsynced changes: Save may overwrite changes!",
					 	'Open Dialog', 'Save As Dialog')
						.then((choice) => ds.showDialog(choice));
				} else {
					//If the file is not currently locked and has no potential unloaded changes,
					//then we may lock the file for ourselves
					lockFile(dsDoc);
				}
			});
		}
	});
	context.subscriptions.push(documentChangedListener);

	let confChangedListener = vscode.workspace.onDidChangeConfiguration((e) => {
		let statusbarAffected = e.affectsConfiguration('dirtyswp.showStatusBarItem');
		if (statusbarAffected) {
			statusBarEnabled = vscode.workspace.getConfiguration().get('dirtyswp.showStatusBarItem');
			if (statusBarEnabled) {
				swpStatusBar.show();
			} else {
				swpStatusBar.hide();
			}
		}
	});
	context.subscriptions.push(confChangedListener);
	
	/**********************
	*  Register commands
	***********************/
	let startCmd = vscode.commands.registerCommand('dirtyswp.start', () => {
		if (active) {
			vscode.window.showInformationMessage("Dirty.swp is already active");
			return
		}
		vscode.window.showInformationMessage("Resuming .swp monitoring and locking");
		active = true;
		addOpenDocuments(true);
	});
	context.subscriptions.push(startCmd);

	let stopCmd = vscode.commands.registerCommand('dirtyswp.stop', () => {
		if (!active) {
			vscode.window.showInformationMessage("Dirty.swp is already paused");
			return
		}
		vscode.window.showInformationMessage("Pausing .swp monitoring and locking.");
		deactivate();
	});
	context.subscriptions.push(stopCmd);

	let lockCmd = vscode.commands.registerCommand('dirtyswp.lockuntilclose', () => {
		if (typeof vscode.window.activeTextEditor === 'undefined') {
			return;
		}
		let name = vscode.window.activeTextEditor.document.uri.toString();
		let dsDoc = DsDocs[name];
		dsDoc.forceLock = true;
		lockFile(dsDoc)
	});
	context.subscriptions.push(lockCmd);

	let listCmd = vscode.commands.registerCommand('dirtyswp.listswp', ds.listSwp);
	context.subscriptions.push(listCmd);

	/**********************
	*  Other stuff
	***********************/

	//Add any documents open on start
	addOpenDocuments();

	//Create status bar
	swpStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
	swpStatusBar.text = ".swp";
	swpStatusBar.command = "dirtyswp.listswp";
	if (statusBarEnabled) {
		swpStatusBar.show();
	}
	context.subscriptions.push(swpStatusBar);
}

const addOpenDocuments = function(createSwpIfDirty = false) {
    vscode.workspace.textDocuments.forEach((openDocument) => {
        if (openDocument.uri.scheme != "file") {
            return
        }
        let dsDoc = new DsDocument(openDocument)
        DsDocs[dsDoc.textDocument.uri.toString()] = dsDoc;
        if (createSwpIfDirty && dsDoc.textDocument.isDirty) {
            lockFile(dsDoc);
        }

        if (!dsDoc.hasOurSwp) {
			checkSwp(dsDoc, (swp) => {
				ds.warn(dsDoc, false, swp);
			}, () => {});
        }
    })
}

export function deactivate() { 
	for (let doc of Object.keys(DsDocs)) {
        DsDocs[doc].removeOwnSwp();
    }
	emptyDocs();
    active = false;
}
export { active, timeBetweenEditWarnings };
