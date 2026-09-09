# 批量给 blocks.js 每个块插入 media 图标字段
import re, io, json

path = r'C:\Users\simple_pear\Desktop\Hermesthings\pageforge\src\blocks.js'
src = io.open(path, encoding='utf-8').read()

# 图标库（id → 语义 SVG，24x24 stroke 风格与工具栏一致）
ICONS = {
'pf-heading': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 5v14M18 5v14M6 12h12"/></svg>',
'pf-subheading': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 6v12M17 6v12M7 12h10"/></svg>',
'pf-paragraph': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h11M4 18h14"/></svg>',
'pf-button': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="8" width="18" height="8" rx="4"/><path d="M8.5 12h7"/></svg>',
'pf-button-ghost': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3" y="8" width="18" height="8" rx="4"/><path d="M8.5 12h7"/></svg>',
'pf-image': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
'pf-divider': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 12h16"/></svg>',
'pf-badge': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="8" width="14" height="8" rx="4"/><path d="M9.5 12h5"/></svg>',
'pf-container': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/></svg>',
'pf-columns-2': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="8.4" height="16" rx="1.5"/><rect x="12.6" y="4" width="8.4" height="16" rx="1.5"/></svg>',
'pf-columns-3': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.6" y="4" width="5.6" height="16" rx="1"/><rect x="9.2" y="4" width="5.6" height="16" rx="1"/><rect x="15.8" y="4" width="5.6" height="16" rx="1"/></svg>',
'pf-spacer': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v18M8 6l4-3 4 3M8 18l4 3 4-3"/></svg>',
'pf-navbar': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h10M7 13h7M7 17h10"/></svg>',
'pf-card': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M3 17l6-6 12 12"/></svg>',
'pf-form': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h5"/></svg>',
'pf-quote': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6h6v5H8a2 2 0 0 0 2 2v1a4 4 0 0 1-4-4v-4z"/><path d="M14 6h6v5h-3a2 2 0 0 0 2 2v1a4 4 0 0 1-4-4v-4z"/></svg>',
'pf-list': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none"/></svg>',
'pf-hero': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M6 9h12M6 13h8M6 17h10"/></svg>',
'pf-hero-img': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="12" rx="2"/><circle cx="8" cy="8" r="1.2"/><path d="M3 13l5-5 13 13"/><path d="M8 19h8M12 17.5V21"/></svg>',
'pf-hero-overlay': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 10h10M7 14h6"/></svg>',
'pf-nav-glass': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="14" rx="7"/><path d="M7 9h10M7 13h7M7 17h10"/></svg>',
'pf-card-glass': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="5"/><path d="M8 9h8M8 13h5M8 17h8"/></svg>',
'pf-section-split': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="9" height="14" rx="1.5"/><circle cx="7.5" cy="9" r="1.2"/><path d="M14 8h7M14 12h5M14 16h7"/></svg>',
'pf-section-split-r': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 8h7M3 12h5M3 16h7"/><rect x="12" y="5" width="9" height="14" rx="1.5"/><circle cx="16.5" cy="9" r="1.2"/></svg>',
'pf-section-features': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2.5" y="5" width="5.6" height="14" rx="1.2"/><rect x="9.2" y="5" width="5.6" height="14" rx="1.2"/><rect x="15.9" y="5" width="5.6" height="14" rx="1.2"/><path d="M5.5 9h.1M12.2 9h.1M18.9 9h.1"/></svg>',
'pf-cta-banner': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 10h8M9.5 14h5"/></svg>',
'pf-quote-big': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5h6v6H8a2 2 0 0 0 2 2v2a5 5 0 0 1-5-5V5z"/><path d="M14 5h6v6h-3a2 2 0 0 0 2 2v2a5 5 0 0 1-5-5V5z"/></svg>',
'pf-reveal': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="3 2.5"><rect x="3" y="4" width="18" height="16" rx="2"/></svg>',
'pf-table': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9h18M3 14h18M9 9v11M15 9v11"/></svg>',
'pf-pricing': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2.5" y="5" width="5.8" height="14" rx="1.2"/><rect x="9.1" y="3" width="5.8" height="16" rx="1.2"/><rect x="15.7" y="5" width="5.8" height="14" rx="1.2"/><path d="M5.5 9h.1M12.2 7h.1M18.9 9h.1"/></svg>',
'pf-faq': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/><circle cx="17.5" cy="16" r="1.3"/></svg>',
'pf-timeline': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 4v16"/><circle cx="6" cy="7" r="1.6"/><circle cx="6" cy="12" r="1.6"/><circle cx="6" cy="17" r="1.6"/><path d="M9.5 7h10M9.5 12h8M9.5 17h10"/></svg>',
'pf-gallery': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="8" rx="1.2"/><rect x="13" y="3" width="8" height="8" rx="1.2"/><rect x="3" y="13" width="8" height="8" rx="1.2"/><rect x="13" y="13" width="8" height="8" rx="1.2"/></svg>',
'pf-video': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5l5 2.5-5 2.5z"/></svg>',
'pf-icon-btns': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="8" width="18" height="8" rx="4"/><circle cx="8" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="1.1" fill="currentColor" stroke="none"/></svg>',
'pf-logos': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2.5" y="5" width="5.6" height="4.5" rx="1"/><rect x="9.2" y="5" width="5.6" height="4.5" rx="1"/><rect x="15.9" y="5" width="5.6" height="4.5" rx="1"/><rect x="2.5" y="12.5" width="5.6" height="4.5" rx="1"/><rect x="9.2" y="12.5" width="5.6" height="4.5" rx="1"/><rect x="15.9" y="12.5" width="5.6" height="4.5" rx="1"/></svg>',
'pf-stats': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V12M10 20V6M16 20V10M21 20H3"/><path d="M4 12l6-6 6 4 5-5"/></svg>',
'pf-grid-2': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="8.4" height="7.5" rx="1.2"/><rect x="12.6" y="4" width="8.4" height="7.5" rx="1.2"/><rect x="3" y="12.5" width="8.4" height="7.5" rx="1.2"/><rect x="12.6" y="12.5" width="8.4" height="7.5" rx="1.2"/></svg>',
'pf-grid-3': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.6" y="3.5" width="5.6" height="7.2" rx="1"/><rect x="9.2" y="3.5" width="5.6" height="7.2" rx="1"/><rect x="15.8" y="3.5" width="5.6" height="7.2" rx="1"/><rect x="2.6" y="12.3" width="5.6" height="7.2" rx="1"/><rect x="9.2" y="12.3" width="5.6" height="7.2" rx="1"/><rect x="15.8" y="12.3" width="5.6" height="7.2" rx="1"/></svg>',
'pf-grid-4': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.2" y="3.5" width="4.4" height="7.2" rx="0.8"/><rect x="7.8" y="3.5" width="4.4" height="7.2" rx="0.8"/><rect x="13.4" y="3.5" width="4.4" height="7.2" rx="0.8"/><rect x="19" y="3.5" width="2.8" height="7.2" rx="0.8"/><rect x="2.2" y="12.3" width="4.4" height="7.2" rx="0.8"/><rect x="7.8" y="12.3" width="4.4" height="7.2" rx="0.8"/><rect x="13.4" y="12.3" width="4.4" height="7.2" rx="0.8"/><rect x="19" y="12.3" width="2.8" height="7.2" rx="0.8"/></svg>',
'pf-footer': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M5 8h14M5 12h14M5 16h9"/></svg>',
}

# 在 blocks 数组每个块对象里插入 media: I.pf-xxx,
# 格式: { id: 'pf-xxx',\n    category: '...',\n    label: '...', → 后面插 media
count = 0
for bid, icon in ICONS.items():
    # 找 "id: 'pf-xxx'," 后最近的一个 "label: '...'," 行，在它后面插入 media
    pat = re.compile(r"(id: '" + re.escape(bid) + r"',\s*category: '[^']*',\s*label: '[^']*',)")
    m = pat.search(src)
    if m:
        src = src[:m.end()] + "\n    media: " + json.dumps(icon, ensure_ascii=False) + "," + src[m.end():]
        count += 1
    else:
        print('未匹配:', bid)

import re, io, json
io.open(path, 'w', encoding='utf-8', newline='').write(src)
print('插入 media:', count, '/', len(ICONS))
