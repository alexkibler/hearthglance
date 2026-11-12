import {escapeHTML as esc} from './model.js';

// Calendar descriptions may contain HTML from Google. Rebuild an allowlisted
// fragment instead of trusting imported attributes, URLs, or embedded content.
export function richTextHTML(value='') {
 const source=String(value),template=document.createElement('template');
 template.innerHTML=/<\/?[a-z][^>]*>/i.test(source)?source:esc(source).replace(/\n/g,'<br>');
 const allowed=new Set(['P','DIV','BR','STRONG','B','EM','I','U','UL','OL','LI','A','BLOCKQUOTE']);
 const blocked=new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','FORM','INPUT','BUTTON','TEXTAREA','SELECT']);
 const clean=node=>{
  if(node.nodeType===3)return document.createTextNode(node.textContent);
  const fragment=document.createDocumentFragment();
  if(node.nodeType!==1||blocked.has(node.tagName))return fragment;
  const output=allowed.has(node.tagName)?document.createElement(node.tagName.toLowerCase()):fragment;
  if(node.tagName==='A'){
   const href=node.getAttribute('href')||'';
   if(/^(https?:\/\/|mailto:)/i.test(href)){output.setAttribute('href',href);output.setAttribute('target','_blank');output.setAttribute('rel','noopener noreferrer');}
  }
  for(const child of node.childNodes)output.append(clean(child));
  return output;
 };
 const result=document.createElement('div');
 for(const child of template.content.childNodes)result.append(clean(child));
 return result.innerHTML;
}

export function richTextField(value='') {
 return `<div class="field full"><span id="event-description-label">Description</span><div class="rich-toolbar" role="toolbar" aria-label="Description formatting">${[['bold','Bold'],['italic','Italic'],['underline','Underline'],['insertUnorderedList','Bullet list'],['insertOrderedList','Numbered list'],['removeFormat','Clear formatting']].map(([command,label])=>`<button type="button" class="btn small" data-action="rich-command" data-rich-command="${command}" aria-label="${label}">${label}</button>`).join('')}</div><div class="rich-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="event-description-label">${richTextHTML(value)}</div></div>`;
}

export const richTextStyles=`
.rich-toolbar{display:flex;gap:6px;flex-wrap:wrap}.rich-toolbar .btn{font-size:12px;min-height:36px;padding:7px 10px}.rich-editor{min-height:130px;max-height:320px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:12px;color:var(--ink);background:var(--surface);font-size:16px;font-weight:400;line-height:1.6}.rich-editor:focus{outline:2px solid var(--accent);outline-offset:2px}.rich-editor p,.rich-description p{margin:0 0 10px}.rich-editor ul,.rich-editor ol,.rich-description ul,.rich-description ol{padding-left:24px}.rich-editor a,.rich-description a{color:var(--accent);text-decoration:underline}.rich-description{white-space:normal}
`;
