// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type * as NextNavigation from "next/navigation";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const storage=vi.hoisted(()=>({cookies:new Map<string,string>(),params:new URLSearchParams('status=pending&targetType=listing'),push:vi.fn()}));
vi.mock('next/headers',()=>({headers:async()=>new Headers(),cookies:async()=>({get:(key:string)=>{const value=storage.cookies.get(key);return value?{value}:undefined;},set:(key:string,value:string)=>storage.cookies.set(key,value)})}));
vi.mock('next/navigation',async(importOriginal)=>({...await importOriginal<typeof NextNavigation>(),useRouter:()=>({push:storage.push,refresh:()=>{}}),useSearchParams:()=>storage.params}));

import ReportsPage from './(admin)/reports/page';
import LoginPage from './login/page';

import { AdminLocaleProvider, AdminLanguageSwitch } from '@/lib/i18n';
import type { AdminLocale } from '@/lib/messages';

beforeEach(()=>{vi.stubGlobal('fetch',vi.fn());storage.cookies.clear();storage.params=new URLSearchParams('status=pending&targetType=listing');});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it.each([
  ['tk','Şikaýatlar nobaty','Saýlanan süzgüçlere laýyk şikaýat ýok.'],
  ['ru','Очередь жалоб','По выбранным фильтрам нет жалоб.'],
  ['en','Complaint queue','No complaints match these filters.'],
] as const)('renders the real complaints route and API bridge in %s without replacing internal hooks/actions',async(locale,title,_empty)=>{
  vi.mocked(fetch).mockResolvedValue(Response.json({items:[],total:0,totalPages:0,page:1,pageSize:50}));
  render(<AdminLocaleProvider initialLocale={locale}>{await ReportsPage({searchParams:Promise.resolve({status:'pending',targetType:'listing'})})}</AdminLocaleProvider>);
  expect(screen.getByRole('heading',{name:title})).toBeDefined();
  expect((document.querySelector('select[name="status"]') as HTMLSelectElement).value).toBe('pending');
  expect((document.querySelector('select[name="targetType"]') as HTMLSelectElement).value).toBe('listing');
  expect(document.querySelector('form')?.getAttribute('action')).toBe('/reports');
  expect(document.body.textContent).not.toContain('private-chat-body');
});
it('switches the real login form to TK and EN while keeping the entered phone',()=>{
  const {container}=render(<AdminLocaleProvider initialLocale="ru"><AdminLanguageSwitch/><LoginPage/></AdminLocaleProvider>);
  const phone=container.querySelector<HTMLInputElement>('input[name="phone"]');if(!phone)throw new Error('Phone missing');
  fireEvent.change(phone,{target:{value:'+99365000001'}});
  fireEvent.change(screen.getByRole('combobox'),{target:{value:'tk'}});
  expect(screen.getByRole('button',{name:'Kody iber'})).toBeDefined();expect(phone.value).toBe('+99365000001');
  fireEvent.change(screen.getByRole('combobox'),{target:{value:'en'}});
  expect(screen.getByRole('button',{name:'Send code'})).toBeDefined();expect(phone.value).toBe('+99365000001');
});
it.each(['tk','ru','en'] as AdminLocale[])('localizes the real API denial in %s without exposing server diagnostics',async(locale)=>{
  vi.mocked(fetch).mockResolvedValue(Response.json({code:'FORBIDDEN',message:'private-chat-body'}, {status:403}));
  render(<AdminLocaleProvider initialLocale={locale}>{await ReportsPage({searchParams:Promise.resolve({})})}</AdminLocaleProvider>);
  expect(document.body.textContent).not.toContain('private-chat-body');
  expect(document.body.textContent).toContain(locale==='tk'?'Ygtyýar ýeterlik däl.':locale==='en'?'Insufficient permission.':'Недостаточно прав.');
});
