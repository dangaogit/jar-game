type Child = Node | string | number | null | undefined | false;
type Props<K extends keyof HTMLElementTagNameMap> = Partial<Omit<HTMLElementTagNameMap[K], 'style' | 'dataset'>> & {
  class?: string;
  style?: string;
  dataset?: Record<string, string>;
};

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props<K> | null, ...children: Child[]) {
  const el = document.createElement(tag);
  if (props) {
    const { class: cls, style, dataset, ...rest } = props;
    if (cls) el.className = cls;
    if (style) el.setAttribute('style', style);
    if (dataset) Object.assign(el.dataset, dataset);
    Object.assign(el, rest);
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(typeof c === 'number' ? String(c) : c);
  return el;
}

/** replaces the children of `el`, skipping null / false entries */
export function fill(el: HTMLElement, ...children: Child[]) {
  el.replaceChildren();
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(typeof c === 'number' ? String(c) : c);
}

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function download(name: string, data: Uint8Array | string, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept });
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export function safeFileName(s: string) {
  return s.replace(/[\\/:*?"<>|\s]+/g, '_') || 'game';
}

export function formatTime(ms: number) {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function isEditable(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el?.closest?.('input, textarea, select, [contenteditable="true"]');
}
