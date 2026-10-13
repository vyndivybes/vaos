// Ported from Saathi source; VAOS stays self-contained with no student file access.
export const MAX_DOC_BYTES=1000000;
export const DOCUMENT_MIMES=Object.freeze({
 pdf:'application/pdf',
 docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
});
export function validateDocumentUpload({name,base64}={}){
 if(typeof name!=='string'||name.length>128||! /^[a-zA-Z0-9][a-zA-Z0-9 _().-]{0,127}\.(pdf|docx|pptx)$/i.test(name)||name.includes('..'))return 'Unsupported document name or format';
 if(typeof base64!=='string'||base64.length<16||base64.length>Math.ceil(MAX_DOC_BYTES*4/3)+8||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))return 'Invalid or oversized document';
 let bytes;try{bytes=atob(base64.slice(0,48))}catch{return 'Invalid document encoding'}
 const ext=name.split('.').at(-1).toLowerCase();
 if(ext==='pdf'&&!bytes.startsWith('%PDF-'))return 'PDF signature mismatch';
 if(ext!=='pdf'&&!(bytes.charCodeAt(0)===80&&bytes.charCodeAt(1)===75))return 'ZIP document signature mismatch';
 return null;
}
export function normalizeConversionResult(value){
 const result=Array.isArray(value)?value[0]:value?.results??value;
 const row=Array.isArray(result)?result[0]:result;
 if(!row||row.format==='error'||!['markdown','text'].includes(row.format)||typeof row.data!=='string'||row.data.trim().length<60)return null;
 return row.data.trim().slice(0,12000);
}
export async function convertDocumentToStudyText({ai,name,base64}={}){
 const invalid=validateDocumentUpload({name,base64});if(invalid)throw Error(invalid);
 if(typeof ai?.toMarkdown!=='function')throw Error('Document conversion unavailable');
 const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
 if(bytes.length>MAX_DOC_BYTES)throw Error('Document exceeds size limit');
 const ext=name.split('.').at(-1).toLowerCase();
 let result;
 try{result=await ai.toMarkdown({name,blob:new Blob([bytes],{type:DOCUMENT_MIMES[ext]})},{conversionOptions:{output:{format:'markdown'}}})}
 catch{throw Error('Document conversion failed or is unavailable')}
 const text=normalizeConversionResult(result);
 if(!text)throw Error('Document conversion failed or returned no reliable text');
 return {status:'ready',name,kind:'manual',text,sourceLabel:'Converted file excerpt (not independently verified)',truncated:text.length>=12000,stored:false,notice:'Document content was converted into an editable text excerpt; tables, figures, handwriting and equations may be incomplete. It was not saved.'};
}
