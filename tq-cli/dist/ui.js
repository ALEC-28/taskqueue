"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.table = table;
exports.ok = ok;
exports.err = err;
exports.statusColor = statusColor;
const chalk_1 = __importDefault(require("chalk"));
const cli_table3_1 = __importDefault(require("cli-table3"));
function table(head, rows) {
    const t = new cli_table3_1.default({
        head: head.map(h => chalk_1.default.cyan(h)),
        style: { border: ['grey'] },
    });
    rows.forEach(r => t.push(r));
    console.log(t.toString());
}
function ok(msg) {
    console.log(chalk_1.default.green('✓') + ' ' + msg);
}
function err(msg) {
    console.error(chalk_1.default.red('✗') + ' ' + msg);
}
function statusColor(s) {
    const map = {
        done: chalk_1.default.green,
        running: chalk_1.default.yellow,
        pending: chalk_1.default.blue,
        retrying: chalk_1.default.magenta,
        failed: chalk_1.default.red,
    };
    return (map[s] ?? chalk_1.default.white)(s);
}
