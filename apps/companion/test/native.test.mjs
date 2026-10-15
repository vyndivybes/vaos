import test from 'node:test';
import assert from 'node:assert/strict';
import {pythonOperation} from '../python.mjs';
test('real Windows input provider refuses an absent exact window before sending input',{skip:process.env.VAOS_NATIVE_ACCEPTANCE!=='1'||process.platform!=='win32',timeout:20000},async()=>{
 await assert.rejects(pythonOperation('desktop.action',{action:'type',targetTitle:'__VAOS_ABSENT_ACCEPTANCE_WINDOW_984638__',text:'This must never be typed.'},{python:process.env.VAOS_COMPANION_PYTHON,timeout:15000}),/DESKTOP_WINDOW_CHANGED/);
});
