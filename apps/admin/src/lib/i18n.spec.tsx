// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AdminNav } from "../app/(admin)/components/AdminNav";

import { AdminLanguageSwitch, AdminLocaleProvider, AdminText } from "./i18n";

let root:Root;let container:HTMLDivElement;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
it('switches all shell labels without remounting unfinished work or changing filters and safely persists a supported locale',async()=>{
  history.replaceState({},'', '/workspace?status=pending&targetType=listing');
  await act(async()=>root.render(<AdminLocaleProvider initialLocale="ru"><AdminLanguageSwitch/><AdminNav capabilities={['support.operations','founder.admission']}/><label><AdminText>Причина</AdminText><input name="reason" defaultValue="Unfinished work"/></label></AdminLocaleProvider>));
  const input=container.querySelector('input');if(!input)throw new Error('Input missing');input.value='Keep this reason';
  const select=container.querySelector('select');if(!select)throw new Error('Locale select missing');
  await act(async()=>{select.value='en';select.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(container.textContent).toContain('Workspace');expect(container.textContent).toContain('Business admission');
  expect(container.textContent).not.toContain('Complaint queue');expect(input.value).toBe('Keep this reason');
  expect(location.search).toBe('?status=pending&targetType=listing');expect(document.cookie).toContain('carberk_admin_locale=en');
  expect(document.documentElement.lang).toBe('en');
  await act(async()=>{select.value='tk';select.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(container.textContent).toContain('Iş meýdançasy');expect(container.textContent).toContain('Sebäp');expect(input.value).toBe('Keep this reason');
});
it('never turns staff navigation into moderation or private feature permission',async()=>{
  await act(async()=>root.render(<AdminLocaleProvider initialLocale="en"><AdminNav capabilities={['support.operations']}/></AdminLocaleProvider>));
  expect([...container.querySelectorAll('a')].map(a=>a.getAttribute('href'))).toEqual(['/workspace']);
});
