import type { Emulator } from '../emulator';
import { BILLING, type BillingRequest } from '../midp/platform';
import type { App, Panel } from './app';
import { formatTime, h } from './dom';

const SETTING = 'jargame:billing-crack';
const KIND_NAMES: Record<number, string> = {
  [BILLING.SMS]: '短信',
  [BILLING.SAMSUNG_SMS]: 'Samsung 短信',
  [BILLING.PLATFORM_REQUEST]: 'platformRequest',
};

interface Entry extends BillingRequest {
  time: number;
}

/** In-app purchase bypass: SMS billing reports success to the game; every billing attempt is listed. */
export class BillingPanel implements Panel {
  private emu: Emulator | null = null;
  private entries: Entry[] = [];
  private enabled = localStorage.getItem(SETTING) !== '0';

  constructor(
    private root: HTMLElement,
    private app: App,
  ) {
    this.render();
  }

  attach(emu: Emulator) {
    if (this.emu?.id !== emu.id) this.entries = [];
    this.emu = emu;
    emu.midp.billingCrack = this.enabled;
    emu.midp.onBilling = (req) => this.record(req);
  }

  private record(req: BillingRequest) {
    this.entries.unshift({ ...req, time: Date.now() });
    this.entries.length = Math.min(this.entries.length, 100);
    if (req.kind === BILLING.PLATFORM_REQUEST) this.app.log(`platformRequest: ${req.address}`);
    else {
      const verdict = req.succeeded ? '已模拟发送成功' : '已拒绝（内购破解关闭）';
      this.app.log(`拦截计费短信 → ${req.address}「${req.text}」，${verdict}`);
    }
    this.render();
  }

  private render() {
    const toggle = h('input', { type: 'checkbox', checked: this.enabled });
    toggle.onchange = () => {
      this.enabled = toggle.checked;
      localStorage.setItem(SETTING, this.enabled ? '1' : '0');
      if (this.emu) this.emu.midp.billingCrack = this.enabled;
    };
    const list = this.entries.length
      ? h(
          'table',
          { class: 'grid' },
          h('thead', null, h('tr', null, ...['时间', '方式', '目标', '内容', '结果'].map((t) => h('th', { textContent: t })))),
          h(
            'tbody',
            null,
            ...this.entries.map((e) =>
              h(
                'tr',
                null,
                h('td', { class: 'muted', textContent: formatTime(e.time).slice(11) }),
                h('td', { textContent: KIND_NAMES[e.kind] ?? String(e.kind) }),
                h('td', { class: 'loc', textContent: e.address, title: e.address }),
                h('td', { class: 'loc', textContent: e.text, title: e.text }),
                h('td', {
                  class: e.kind === BILLING.PLATFORM_REQUEST ? 'muted' : e.succeeded ? 'ok' : 'err',
                  textContent: e.kind === BILLING.PLATFORM_REQUEST ? '仅记录' : e.succeeded ? '成功' : '失败',
                }),
              ),
            ),
          ),
        )
      : h('p', { class: 'muted note', textContent: '本次运行还没有计费请求。' });
    this.root.replaceChildren(
      h('label', { class: 'switch' }, toggle, h('span', { textContent: '内购破解：计费短信一律返回发送成功' })),
      h('p', {
        class: 'muted note',
        textContent:
          '模拟器不会真正发送任何短信。很多游戏通过短信（WMA 或 Samsung SMS 接口）购买关卡、道具：开启时游戏会认为付费成功；关闭时表现为短信发送失败。platformRequest（打开网页、拨号等）只记录、不执行。',
      }),
      h('h3', { textContent: '计费记录' }),
      list,
    );
  }
}
