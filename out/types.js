"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.swpFile = exports.DsDocument = void 0;
const fs = require("fs");
const path = require("path");
class DsDocument {
    constructor(document) {
        let self = this;
        let filePath = document.uri.fsPath;
        let folder = path.dirname(filePath);
        let basename = path.basename(filePath);
        this.textDocument = document;
        this.basename = basename;
        this.swapPath = path.join(folder, "." + basename + ".swp");
        this.hasOurSwp = false;
        this.forceLock = false;
        //If the file has been in use by someone else while dirty,
        //then there may be unimported changes on disk that risk being overwritten
        this.potentialUnsyncedChanges = false;
        this.removeOwnSwp = function () {
            if (self.hasOurSwp) {
                fs.unlink(self.swapPath, (err) => {
                    if (err) {
                        console.error("Unable to remove own .swp");
                    }
                });
                self.hasOurSwp = false;
            }
        };
    }
}
exports.DsDocument = DsDocument;
class swpFile {
    constructor(fileData) {
        this.vscodeSwp = false;
        this.swpId = null;
        this.swpUser = null;
        if (fileData.length >= 6 && fileData.substring(0, 6) !== "VSCODE") {
            return;
        }
        let temp = fileData.split(":");
        this.vscodeSwp = true;
        this.swpId = temp[0];
        if (temp.length > 1) {
            this.swpUser = temp[1];
        }
    }
}
exports.swpFile = swpFile;
//# sourceMappingURL=types.js.map