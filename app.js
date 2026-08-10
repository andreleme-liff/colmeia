/* LIFF Ops — sistema de gestão de atividades.
   React sem build: React.createElement direto, componentes do design system
   LIFF vindos de window.LIFFDesignSystem_064c9d. */

(() => {
  const h = React.createElement;
  const { useState, useMemo, useCallback, useRef } = React;

  const DS = window.LIFFDesignSystem_064c9d;
  const { LiffMark, Button, Field, Input, Select, Switch } = DS;

  const D = window.LIFFOpsData;
  const { AREAS, STATUS, STAGES, NAV, TITLES, ADMIN_CARDS, CRITICAL_DUE } = D;

  /* ---------- tokens usados na composição ---------- */
  const C = {
    canvas:  'var(--liff-obsidiana)',
    panel:   'var(--liff-panel)',
    panel2:  'var(--liff-panel-2)',
    cell:    'var(--liff-cell)',
    code:    'var(--liff-code-bg)',
    line:    'var(--liff-charcoal)',
    ink:     'var(--liff-floral)',
    body:    'var(--liff-body-ink)',
    dust:    'var(--liff-dust)',
    faint:   'var(--liff-muted)',
    accent:  'var(--liff-paprika)',
    success: 'var(--liff-success)',
    warning: 'var(--liff-warning)',
    error:   'var(--liff-error)',
    info:    'var(--liff-info)'
  };

  const SANS = 'var(--liff-font-body)';
  const MONO = 'var(--liff-font-mono)';

  /* Eyebrow / rótulo técnico: mono, caixa alta, tracking largo. */
  const eyebrow = (fontSize, color, letterSpacing = '0.16em') => ({
    fontFamily: MONO, fontSize, letterSpacing, textTransform: 'uppercase', color
  });
  /* Quadradinho de 3px que substitui ícone em tabelas e legendas. */
  const dot = color => ({ width: 7, height: 7, borderRadius: 3, background: color });
  /* Malha estrutural: fundo charcoal + gap de 1px = fios entre células. */
  const mesh = (extra = {}) => ({ background: C.line, border: `1px solid ${C.line}`, ...extra });

  /* ---------- domínio ---------- */
  const areaOf = id => AREAS.find(a => a.id === id) || { label: '—', color: C.faint, short: '—' };
  const statusLabel = k => (STATUS.find(s => s.key === k) || {}).label || k;
  const statusColor = k =>
    ({ backlog: C.faint, andamento: C.info, revisao: C.warning, concluido: C.success })[k];
  const prioColor = p => (p === 'alta' ? C.error : p === 'media' ? C.warning : C.faint);
  const brl = v => 'R$ ' + (v / 1000).toFixed(0) + 'k';
  const pad2 = n => String(n).padStart(2, '0');
  const stamp = () => {
    const d = new Date();
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };
  const today = () => {
    const d = new Date();
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
  };

  /* Permissão efetiva do usuário logado sobre cada área. */
  function scopeOf(state) {
    const me = state.users.find(u => u.id === state.userId) || state.users[0];
    const perm = areaId => (me.role === 'Admin' ? 'edit' : me.perms[areaId] || null);
    const canSee = areaId => !!perm(areaId);
    const canEdit = areaId => perm(areaId) === 'edit';
    const visibleAreas = AREAS.filter(a => perm(a.id));
    const scoped = list =>
      list.filter(x => canSee(x.area) && (state.area === 'all' || x.area === state.area));
    return { me, perm, canSee, canEdit, visibleAreas, scoped };
  }

  /* Resumo textual para colar no WhatsApp. */
  function waText(state, scope) {
    const areaIds = state.waArea === 'all' ? scope.visibleAreas.map(a => a.id) : [state.waArea];
    const acts = state.activities.filter(a => areaIds.includes(a.area));
    const deals = state.deals.filter(d => areaIds.includes(d.area));
    const head =
      state.waArea === 'all' ? 'LIFF — Status geral' : 'LIFF ' + areaOf(state.waArea).label + ' — Status';
    const L = [];
    L.push(`*${head}* (${today()})`);
    L.push('');
    L.push(
      `Atividades: ${acts.length} - ${acts.filter(a => a.status === 'andamento').length} em andamento, ` +
      `${acts.filter(a => a.status === 'revisao').length} em revisão, ` +
      `${acts.filter(a => a.status === 'concluido').length} concluídas`
    );
    L.push('');

    const foco = acts.filter(a => a.status === 'andamento' || a.status === 'revisao').slice(0, 5);
    if (foco.length) {
      L.push('*Em execução*');
      foco.forEach(a =>
        L.push(`- ${a.title} - ${a.owner.split(' ')[0]} (${statusLabel(a.status).toLowerCase()}, vence ${a.due})`)
      );
      L.push('');
    }

    if (deals.length) {
      const abertos = deals.filter(x => x.stage !== 'ganho');
      L.push('*Comercial*');
      L.push(`- Pipeline aberto: ${brl(abertos.reduce((s, x) => s + x.valor, 0))} em ${abertos.length} oportunidades`);
      const ganhos = deals.filter(x => x.stage === 'ganho');
      if (ganhos.length) L.push(`- Ganhos no período: ${ganhos.map(g => g.conta).join(', ')}`);
      deals
        .filter(x => x.stage === 'negociacao' || x.stage === 'proposta')
        .slice(0, 3)
        .forEach(x => L.push(`- ${x.conta}: ${STAGES.find(s => s.key === x.stage).label} - ${brl(x.valor)} (${x.prox})`));
      L.push('');
    }

    const conc = acts.filter(a => a.status === 'concluido').slice(0, 3);
    if (conc.length) {
      L.push('*Concluído recentemente*');
      conc.forEach(a => L.push(`- ${a.title}`));
      L.push('');
    }

    L.push(`Alterações registradas hoje: ${state.logs.filter(l => l.ts.startsWith(today())).length}`);
    L.push(`Reportado por ${scope.me.name} via LIFF Ops`);
    return L.join('\n');
  }

  /* =========================================================
     Login — SSO Google restrito ao domínio liff.com.br
     ========================================================= */
  function LoginScreen({ users, onLogin }) {
    return h('div', { className: 'liff-login' },
      h('div', { className: 'liff-login__pitch' },
        h(LiffMark, { height: 34, tone: 'light' }),
        h('div', null,
          h('div', { style: { ...eyebrow(12, C.accent), marginBottom: 24 } }, 'LIFF/ OPS'),
          h('h1', {
            style: {
              fontSize: 52, lineHeight: 1.02, letterSpacing: '-0.035em', fontWeight: 800,
              color: C.ink, margin: '0 0 20px', maxWidth: '15ch', textWrap: 'pretty'
            }
          }, 'Toda a operação da LIFF em um único sistema.'),
          h('p', {
            style: { fontSize: 16, lineHeight: 1.62, color: C.body, margin: 0, maxWidth: '46ch' }
          }, 'Atividade comercial, execução operacional, cadastros e administração — organizados por área, com permissão por usuário e log de alterações em tudo.')
        ),
        h('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap' } },
          ['CRM', 'KANBAN', 'AUDITORIA', 'PERMISSÕES'].map((t, i) =>
            h(React.Fragment, { key: t },
              i > 0 ? h('span', { style: { color: C.line } }, '/') : null,
              h('span', { style: eyebrow(11, C.faint, '0.14em') }, t)
            )
          )
        )
      ),
      h('div', { className: 'liff-login__panel' },
        h('div', { style: { width: '100%', maxWidth: 420, background: C.panel, border: `1px solid ${C.line}`, padding: 36 } },
          h('div', { style: { ...eyebrow(11, C.faint), marginBottom: 8 } }, 'ACESSO'),
          h('h2', { style: { fontSize: 26, letterSpacing: '-0.02em', fontWeight: 800, color: C.ink, margin: '0 0 6px' } },
            'Entrar com Google'),
          h('p', { style: { fontSize: 14, lineHeight: 1.6, color: C.faint, margin: '0 0 28px' } },
            'SSO restrito ao domínio liff.com.br. O acesso a cada área é definido pela administração.'),
          h('div', { style: mesh({ display: 'flex', flexDirection: 'column', gap: 1 }) },
            users.map(u =>
              h('div', {
                key: u.id, className: 'liff-hover-cell', onClick: () => onLogin(u.id),
                style: { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: C.cell, cursor: 'pointer' }
              },
                h('div', { style: avatarStyle(34) }, u.initials),
                h('div', { style: { flex: 1, minWidth: 0 } },
                  h('div', { style: { fontSize: 14, color: C.ink, fontWeight: 600 } }, u.name),
                  h('div', { style: { fontFamily: MONO, fontSize: 11, color: C.faint } }, u.email)
                ),
                h('div', { style: eyebrow(10, C.faint, '0.12em') }, u.role)
              )
            )
          ),
          h('div', { style: { marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            h('span', { style: { fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', color: C.line } }, 'GOOGLE WORKSPACE SSO'),
            h('span', { style: { fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', color: C.faint } }, '/ protótipo')
          )
        )
      )
    );
  }

  const avatarStyle = size => ({
    width: size, height: size, borderRadius: 999, background: C.panel2,
    border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontFamily: MONO, fontSize: size > 32 ? 12 : 11, color: C.dust, flex: 'none'
  });

  /* =========================================================
     Visão geral
     ========================================================= */
  function Overview({ kpis, areaLoad, recentLogs }) {
    return h(React.Fragment, null,
      h('div', { className: 'liff-kpis', style: mesh({ display: 'grid', gap: 1, marginBottom: 28 }) },
        kpis.map(k =>
          h('div', { key: k.label, style: { background: C.cell, padding: '22px 20px' } },
            h('div', { style: eyebrow(10, C.faint) }, k.label),
            h('div', { style: { fontSize: 38, fontWeight: 800, letterSpacing: '-0.035em', color: k.color, lineHeight: 1.1, marginTop: 8 } }, k.value),
            h('div', { style: { fontSize: 13, color: C.faint } }, k.hint)
          )
        )
      ),
      h('div', { className: 'liff-overview-split', style: mesh({ display: 'grid', gap: 1 }) },
        h('section', { style: { background: C.cell, padding: 24 } },
          h('div', { style: { ...eyebrow(11, C.dust), marginBottom: 20 } }, 'CARGA POR ÁREA'),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
            areaLoad.map(a =>
              h('div', { key: a.label },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: C.body, marginBottom: 7 } },
                  h('span', { style: { display: 'flex', alignItems: 'center', gap: 9 } },
                    h('span', { style: { ...dot(a.color), width: 8, height: 8 } }), a.label),
                  h('span', { style: { fontFamily: MONO, fontSize: 12, color: C.faint } }, a.meta)
                ),
                h('div', { style: { height: 6, background: C.canvas, border: `1px solid ${C.line}` } },
                  h('div', { style: { height: '100%', width: a.pct, background: a.color } })
                )
              )
            )
          )
        ),
        h('section', { style: { background: C.cell, padding: 24 } },
          h('div', { style: { ...eyebrow(11, C.dust), marginBottom: 20 } }, 'ÚLTIMAS ALTERAÇÕES'),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
            recentLogs.map(l =>
              h('div', { key: l.id, style: { display: 'flex', gap: 12 } },
                h('div', { style: { fontFamily: MONO, fontSize: 11, color: C.line, whiteSpace: 'nowrap', paddingTop: 2 } }, l.ts),
                h('div', { style: { minWidth: 0 } },
                  h('div', { style: { fontSize: 13, color: C.body, lineHeight: 1.5 } }, l.text),
                  h('div', { style: { ...eyebrow(10, C.faint, '0.1em'), marginTop: 3 } }, `${l.who} · ${areaOf(l.area).label}`)
                )
              )
            )
          )
        )
      )
    );
  }

  /* =========================================================
     Comercial — pipeline por estágio
     ========================================================= */
  function Comercial({ stages, onMoveDeal }) {
    return h('div', { style: mesh({ display: 'flex', gap: 1, overflowX: 'auto' }) },
      stages.map(col =>
        h('div', {
          key: col.key,
          style: { background: C.cell, minWidth: 236, flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }
        },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
            h('span', { style: eyebrow(11, C.dust, '0.14em') }, col.label),
            h('span', { style: { fontFamily: MONO, fontSize: 11, color: C.faint } }, col.total)
          ),
          col.cards.map(d =>
            h('div', {
              key: d.id,
              style: { background: C.panel, border: `1px solid ${C.line}`, borderTop: `2px solid ${d.color}`, padding: 14 }
            },
              h('div', { style: { fontSize: 14, fontWeight: 600, color: C.ink, lineHeight: 1.35 } }, d.conta),
              h('div', { style: { fontSize: 12, color: C.faint, marginTop: 4, lineHeight: 1.5 } }, d.escopo),
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 } },
                h('span', { style: { fontFamily: MONO, fontSize: 13, color: d.color } }, d.valor),
                h('span', { style: eyebrow(10, C.faint, '0.1em') }, d.owner)
              ),
              h('div', {
                style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, borderTop: `1px solid ${C.line}`, paddingTop: 10 }
              },
                h('span', { style: { fontFamily: MONO, fontSize: 10, color: C.faint } }, d.prox),
                h('span', { style: { display: 'flex', gap: 6 } },
                  [-1, 1].map(dir =>
                    h('span', {
                      key: dir,
                      onClick: e => { e.stopPropagation(); onMoveDeal(d.id, dir); },
                      title: d.editable ? 'Mover estágio' : 'Sem permissão de edição nesta área',
                      style: {
                        cursor: d.editable ? 'pointer' : 'not-allowed', fontFamily: MONO, fontSize: 12,
                        color: d.ctrl, padding: '0 5px', border: `1px solid ${C.line}`
                      }
                    }, dir < 0 ? '←' : '→')
                  )
                )
              )
            )
          )
        )
      )
    );
  }

  /* =========================================================
     Operações — kanban com arrastar e soltar
     ========================================================= */
  function Operacoes({ board, onDropCard, onOpen }) {
    return h(React.Fragment, null,
      h('div', { style: mesh({ display: 'flex', gap: 1, overflowX: 'auto', alignItems: 'stretch' }) },
        board.map(col =>
          h('div', {
            key: col.key,
            onDragOver: e => e.preventDefault(),
            onDrop: e => {
              e.preventDefault();
              onDropCard(e.dataTransfer.getData('text/plain'), col.key);
            },
            style: {
              background: C.cell, minWidth: 262, flex: 1, padding: 16,
              display: 'flex', flexDirection: 'column', gap: 12, minHeight: 420
            }
          },
            h('div', {
              style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `1px solid ${C.line}`, paddingBottom: 10 }
            },
              h('span', { style: eyebrow(11, C.dust, '0.14em') }, col.label),
              h('span', { style: { fontFamily: MONO, fontSize: 11, color: C.faint } }, col.count)
            ),
            col.cards.map(c =>
              h('div', {
                key: c.id, className: 'liff-hover-card',
                draggable: c.drag,
                onDragStart: e => e.dataTransfer.setData('text/plain', c.id),
                onClick: () => onOpen(c.id),
                style: {
                  background: C.panel, border: `1px solid ${C.line}`, borderLeft: `2px solid ${c.color}`,
                  padding: 14, cursor: 'pointer'
                }
              },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 10 } },
                  h('span', { style: eyebrow(10, c.color, '0.12em') }, c.areaLabel),
                  h('span', { style: eyebrow(10, prioColor(c.prio), '0.12em') }, c.prio)
                ),
                h('div', { style: { fontSize: 14, color: C.ink, lineHeight: 1.4, marginTop: 9, fontWeight: 600 } }, c.title),
                h('div', {
                  style: { display: 'flex', justifyContent: 'space-between', marginTop: 12, fontFamily: MONO, fontSize: 10, color: C.faint }
                },
                  h('span', null, c.owner),
                  h('span', null, c.due)
                )
              )
            )
          )
        )
      ),
      h('div', { style: { fontFamily: MONO, fontSize: 11, color: C.faint, marginTop: 14, lineHeight: 1.6 } },
        'Arraste os cards entre as colunas — o movimento é gravado no log com autor e horário. Cards de áreas sem permissão de edição não se movem.')
    );
  }

  /* =========================================================
     Atividades — tabela plana
     ========================================================= */
  const ACT_COLS = '2.4fr 1fr 1fr 1fr 0.8fr 0.9fr';

  function Atividades({ rows, onOpen }) {
    return h('div', { className: 'liff-scroll-x', style: { border: `1px solid ${C.line}` } },
      h('div', { className: 'liff-table' },
        h('div', { style: { display: 'grid', gridTemplateColumns: ACT_COLS, background: C.canvas, borderBottom: `1px solid ${C.line}` } },
          ['ATIVIDADE', 'ÁREA', 'TIPO', 'RESPONSÁVEL', 'PRAZO', 'STATUS'].map(head =>
            h('div', { key: head, style: { padding: '12px 16px', ...eyebrow(10, C.faint) } }, head)
          )
        ),
        rows.map(r =>
          h('div', {
            key: r.id, className: 'liff-hover-row', onClick: () => onOpen(r.id),
            style: {
              display: 'grid', gridTemplateColumns: ACT_COLS, background: C.cell,
              borderBottom: `1px solid ${C.line}`, cursor: 'pointer', alignItems: 'center'
            }
          },
            h('div', { style: { padding: '14px 16px', fontSize: 14, color: C.ink } }, r.title),
            h('div', { style: { padding: '14px 16px', fontSize: 13, color: r.color, display: 'flex', alignItems: 'center', gap: 8 } },
              h('span', { style: dot(r.color) }), r.areaLabel),
            h('div', { style: { padding: '14px 16px', ...eyebrow(11, C.dust, '0.08em') } }, r.tipo),
            h('div', { style: { padding: '14px 16px', fontSize: 13, color: C.body } }, r.owner),
            h('div', { style: { padding: '14px 16px', fontFamily: MONO, fontSize: 12, color: r.dueColor } }, r.due),
            h('div', { style: { padding: '14px 16px', ...eyebrow(10, r.statusColor, '0.1em') } }, r.statusLabel)
          )
        )
      )
    );
  }

  /* =========================================================
     Cadastros
     ========================================================= */
  const CAD_TABS = [
    { key: 'contas',  label: 'contas' },
    { key: 'pessoas', label: 'pessoas' },
    { key: 'areas',   label: 'áreas' },
    { key: 'tipos',   label: 'tipos de atividade' }
  ];

  function cadastroSet(state, scope, tab) {
    if (tab === 'pessoas') {
      return {
        head: ['PESSOA', 'PAPEL', 'E-MAIL'],
        rows: state.users.map(u => ({ key: u.id, a: u.name, b: u.role, c: u.email })),
        ph: 'Nome completo'
      };
    }
    if (tab === 'areas') {
      return {
        head: ['ÁREA', 'VERTICAL', 'ATIVIDADES'],
        rows: AREAS.map(a => ({
          key: a.id, a: 'LIFF ' + a.label, b: a.short,
          c: state.activities.filter(x => x.area === a.id).length + ' ativas'
        })),
        ph: 'Nome da área'
      };
    }
    if (tab === 'tipos') {
      const count = t => state.activities.filter(x => x.tipo === t).length + ' registros';
      return {
        head: ['TIPO', 'FLUXO', 'USO'],
        rows: [
          { key: 'Comercial',     a: 'Comercial',     b: 'Pipeline CRM', c: count('Comercial') },
          { key: 'Operacional',   a: 'Operacional',   b: 'Kanban',       c: count('Operacional') },
          { key: 'Produto',       a: 'Produto',       b: 'Kanban',       c: count('Produto') },
          { key: 'Institucional', a: 'Institucional', b: 'Kanban',       c: count('Institucional') }
        ],
        ph: 'Nome do tipo'
      };
    }
    return {
      head: ['CONTA', 'ÁREA', 'RESPONSÁVEL'],
      rows: state.deals.filter(d => scope.canSee(d.area)).map(d => ({
        key: d.id, a: d.conta, b: areaOf(d.area).label, c: d.owner
      })),
      ph: 'Razão social'
    };
  }

  function Cadastros({ cadTab, onTab, set, areaOptions, cannotEditAny }) {
    return h(React.Fragment, null,
      h('div', { style: mesh({ display: 'flex', gap: 1, width: 'fit-content', marginBottom: 22, flexWrap: 'wrap' }) },
        CAD_TABS.map(t =>
          h('div', {
            key: t.key, onClick: () => onTab(t.key),
            style: {
              padding: '9px 16px', cursor: 'pointer', ...eyebrow(11, cadTab === t.key ? C.ink : C.faint, '0.1em'),
              background: cadTab === t.key ? C.panel2 : C.canvas
            }
          }, t.label)
        )
      ),
      h('div', { className: 'liff-cad-split', style: mesh({ display: 'grid', gap: 1 }) },
        h('div', { className: 'liff-scroll-x', style: { background: C.cell } },
          h('div', { style: { minWidth: 480 } },
            h('div', { style: { display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', background: C.canvas, borderBottom: `1px solid ${C.line}` } },
              set.head.map(head => h('div', { key: head, style: { padding: '12px 16px', ...eyebrow(10, C.faint) } }, head))
            ),
            set.rows.map(r =>
              h('div', { key: r.key, style: { display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', borderBottom: `1px solid ${C.line}` } },
                h('div', { style: { padding: '13px 16px', fontSize: 14, color: C.ink } }, r.a),
                h('div', { style: { padding: '13px 16px', fontSize: 13, color: C.body } }, r.b),
                h('div', { style: { padding: '13px 16px', fontFamily: MONO, fontSize: 11, color: C.faint } }, r.c)
              )
            )
          )
        ),
        h('div', { style: { background: C.cell, padding: 22 } },
          h('div', { style: { ...eyebrow(11, C.dust), marginBottom: 18 } }, 'NOVO REGISTRO'),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
            h(Field, { label: 'Nome' }, h(Input, { placeholder: set.ph })),
            h(Field, { label: 'Área' }, h(Select, { options: areaOptions })),
            h(Field, { label: 'Observação' }, h(Input, { placeholder: 'opcional' })),
            h(Button, { variant: 'outline', size: 'sm', disabled: cannotEditAny, style: { justifyContent: 'center' } }, 'cadastrar'),
            h('div', { style: { fontSize: 12, lineHeight: 1.6, color: C.faint } },
              'Cadastros alimentam os seletores de atividades, oportunidades e permissões. Alterações entram na auditoria.')
          )
        )
      )
    );
  }

  /* =========================================================
     Administração — matriz de permissões
     ========================================================= */
  const PERM_COLS = '1.5fr repeat(6,1fr) 0.9fr';
  const PERM_STYLE = {
    edit: { label: 'editar', bg: 'color-mix(in srgb, #3BA66B 12%, transparent)', bd: 'color-mix(in srgb, #3BA66B 35%, transparent)', ink: C.success },
    view: { label: 'ver',    bg: 'color-mix(in srgb, #2E6F95 12%, transparent)', bd: 'color-mix(in srgb, #2E6F95 35%, transparent)', ink: C.info },
    none: { label: '—',      bg: 'transparent',                                  bd: C.line,                                        ink: C.line }
  };

  function Admin({ users, isAdmin, onCyclePerm }) {
    return h(React.Fragment, null,
      h('div', { className: 'liff-scroll-x', style: { border: `1px solid ${C.line}`, marginBottom: 28 } },
        h('div', { style: { minWidth: 820 } },
          h('div', { style: { display: 'grid', gridTemplateColumns: PERM_COLS, background: C.canvas, borderBottom: `1px solid ${C.line}` } },
            h('div', { style: { padding: '12px 16px', ...eyebrow(10, C.faint) } }, 'USUÁRIO'),
            AREAS.map(a =>
              h('div', { key: a.id, style: { padding: '12px 10px', ...eyebrow(10, a.color, '0.1em'), textAlign: 'center' } }, a.short)
            ),
            h('div', { style: { padding: '12px 16px', ...eyebrow(10, C.faint), textAlign: 'center' } }, 'ATIVO')
          ),
          users.map(u =>
            h('div', {
              key: u.id,
              style: { display: 'grid', gridTemplateColumns: PERM_COLS, background: C.cell, borderBottom: `1px solid ${C.line}`, alignItems: 'center' }
            },
              h('div', { style: { padding: '13px 16px' } },
                h('div', { style: { fontSize: 14, color: C.ink, fontWeight: 600 } }, u.name),
                h('div', { style: eyebrow(10, C.faint, '0.1em') }, u.role)
              ),
              AREAS.map(a => {
                const level = u.role === 'Admin' ? 'edit' : u.perms[a.id] || 'none';
                const s = PERM_STYLE[level];
                const locked = !isAdmin || u.role === 'Admin';
                return h('div', {
                  key: a.id,
                  onClick: () => onCyclePerm(u.id, a.id),
                  title: locked ? 'Permissões de Admin não são editáveis' : 'Clique para alternar sem acesso / ver / editar',
                  style: {
                    margin: 8, padding: '7px 4px', textAlign: 'center', cursor: locked ? 'default' : 'pointer',
                    ...eyebrow(10, s.ink, '0.1em'), border: `1px solid ${s.bd}`, background: s.bg, borderRadius: 6
                  }
                }, s.label);
              }),
              h('div', { style: { display: 'flex', justifyContent: 'center' } },
                h(Switch, { checked: u.active, onChange: () => {} })
              )
            )
          )
        )
      ),
      h('div', { className: 'liff-admin-cards', style: mesh({ display: 'grid', gap: 1 }) },
        ADMIN_CARDS.map(c =>
          h('div', { key: c.title, style: { background: C.cell, padding: 22 } },
            h('div', { style: { ...eyebrow(11, C.accent), marginBottom: 10 } }, c.title),
            h('div', { style: { fontSize: 13, lineHeight: 1.6, color: C.body } }, c.body)
          )
        )
      )
    );
  }

  /* =========================================================
     Auditoria
     ========================================================= */
  const AUDIT_COLS = '0.8fr 1fr 1fr 2.6fr';

  function Auditoria({ logs }) {
    return h('div', { className: 'liff-scroll-x', style: { border: `1px solid ${C.line}` } },
      h('div', { style: { minWidth: 760 } },
        h('div', { style: { display: 'grid', gridTemplateColumns: AUDIT_COLS, background: C.canvas, borderBottom: `1px solid ${C.line}` } },
          ['QUANDO', 'QUEM', 'ÁREA', 'O QUE MUDOU'].map(head =>
            h('div', { key: head, style: { padding: '12px 16px', ...eyebrow(10, C.faint) } }, head)
          )
        ),
        logs.map(l => {
          const a = areaOf(l.area);
          return h('div', {
            key: l.id,
            style: { display: 'grid', gridTemplateColumns: AUDIT_COLS, background: C.cell, borderBottom: `1px solid ${C.line}`, alignItems: 'center' }
          },
            h('div', { style: { padding: '13px 16px', fontFamily: MONO, fontSize: 11, color: C.faint } }, l.ts),
            h('div', { style: { padding: '13px 16px', fontSize: 13, color: C.body } }, l.who),
            h('div', { style: { padding: '13px 16px', fontSize: 13, color: a.color, display: 'flex', alignItems: 'center', gap: 8 } },
              h('span', { style: dot(a.color) }), a.label),
            h('div', { style: { padding: '13px 16px', fontSize: 13, color: C.ink, lineHeight: 1.5 } }, l.text)
          );
        })
      )
    );
  }

  /* =========================================================
     Drawer da atividade
     ========================================================= */
  function Drawer({ act, editable, logs, people, onClose, onStatus, onOwner, onPrio }) {
    const a = areaOf(act.area);
    return h(React.Fragment, null,
      h('div', { onClick: onClose, style: { position: 'fixed', inset: 0, background: 'rgba(14,16,20,0.72)', zIndex: 40 } }),
      h('div', { className: 'liff-drawer' },
        h('div', { style: { padding: '24px 26px', borderBottom: `1px solid ${C.line}` } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 } },
            h('div', null,
              h('div', { style: eyebrow(10, a.color) }, `${a.label} / ${act.tipo}`),
              h('div', { style: { fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', color: C.ink, lineHeight: 1.25, marginTop: 8 } }, act.title)
            ),
            h('span', { onClick: onClose, role: 'button', 'aria-label': 'Fechar', style: { cursor: 'pointer', fontFamily: MONO, fontSize: 16, color: C.faint } }, '×')
          ),
          h('div', { style: { fontFamily: MONO, fontSize: 11, color: C.line, marginTop: 10 } }, `${act.id} · vence ${act.due}`)
        ),
        h('div', { style: { padding: '24px 26px', borderBottom: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 18 } },
          h('div', null,
            h('div', { style: { ...eyebrow(10, C.faint), marginBottom: 9 } }, 'STATUS'),
            h('div', { style: mesh({ display: 'flex', gap: 1 }) },
              STATUS.map(s => {
                const on = act.status === s.key;
                return h('div', {
                  key: s.key, onClick: () => onStatus(s.key),
                  style: {
                    flex: 1, textAlign: 'center', padding: '9px 6px', cursor: editable ? 'pointer' : 'not-allowed',
                    ...eyebrow(10, on ? C.canvas : C.faint, '0.08em'),
                    background: on ? statusColor(s.key) : C.canvas
                  }
                }, s.label);
              })
            )
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 } },
            h('div', null,
              h('div', { style: { ...eyebrow(10, C.faint), marginBottom: 9 } }, 'RESPONSÁVEL'),
              h('select', {
                value: act.owner, onChange: e => onOwner(e.target.value), disabled: !editable,
                style: nativeSelectStyle
              }, people.map(p => h('option', { key: p, value: p }, p)))
            ),
            h('div', null,
              h('div', { style: { ...eyebrow(10, C.faint), marginBottom: 9 } }, 'PRIORIDADE'),
              h('select', {
                value: act.prio, onChange: e => onPrio(e.target.value), disabled: !editable,
                style: nativeSelectStyle
              },
                h('option', { value: 'alta' }, 'alta'),
                h('option', { value: 'media' }, 'média'),
                h('option', { value: 'baixa' }, 'baixa')
              )
            )
          ),
          h('div', { style: { fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: editable ? C.faint : C.warning } },
            editable
              ? 'Você tem permissão de edição nesta área. Toda alteração é registrada no log.'
              : `Somente leitura — seu perfil não tem permissão de edição em ${a.label}.`)
        ),
        h('div', { style: { padding: '24px 26px' } },
          h('div', { style: { ...eyebrow(11, C.dust), marginBottom: 18 } }, 'LOG DE ALTERAÇÕES'),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
            logs.length
              ? logs.map(l =>
                  h('div', { key: l.id, style: { borderLeft: `1px solid ${C.line}`, paddingLeft: 14 } },
                    h('div', { style: { fontSize: 13, color: C.body, lineHeight: 1.5 } }, l.text),
                    h('div', { style: { ...eyebrow(10, C.faint, '0.1em'), marginTop: 4 } }, `${l.who} · ${l.ts}`)
                  )
                )
              : h('div', { style: { fontSize: 13, color: C.faint } }, 'Nenhuma alteração registrada nesta atividade.')
          )
        )
      )
    );
  }

  const nativeSelectStyle = {
    width: '100%', background: C.canvas, border: `1px solid ${C.line}`, borderRadius: 6,
    color: C.ink, fontFamily: SANS, fontSize: 14, padding: '10px 12px'
  };

  /* =========================================================
     Resumo para WhatsApp
     ========================================================= */
  function WaModal({ tabs, waArea, text, copied, onArea, onCopy, onClose }) {
    return h('div', {
      onClick: onClose,
      style: {
        position: 'fixed', inset: 0, background: 'rgba(14,16,20,0.78)', zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
      }
    },
      h('div', {
        onClick: e => e.stopPropagation(),
        style: { width: 560, maxWidth: '100%', maxHeight: '82vh', overflow: 'auto', background: C.panel, border: `1px solid ${C.line}` }
      },
        h('div', { style: { padding: '24px 26px', borderBottom: `1px solid ${C.line}` } },
          h('div', { style: eyebrow(10, C.accent) }, 'LIFF/ REPORT'),
          h('div', { style: { fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', color: C.ink, marginTop: 6 } },
            'Resumo de status para WhatsApp')
        ),
        h('div', { style: mesh({ display: 'flex', gap: 1, flexWrap: 'wrap', borderTop: 0, borderLeft: 0, borderRight: 0 }) },
          tabs.map(t =>
            h('div', {
              key: t.id, onClick: () => onArea(t.id),
              style: {
                padding: '11px 14px', cursor: 'pointer', flex: 1, textAlign: 'center',
                ...eyebrow(11, waArea === t.id ? C.ink : C.faint, '0.1em'),
                background: waArea === t.id ? C.panel2 : C.canvas
              }
            }, t.label)
          )
        ),
        h('div', { style: { padding: '24px 26px' } },
          h('pre', {
            style: {
              margin: 0, whiteSpace: 'pre-wrap', fontFamily: MONO, fontSize: 12.5, lineHeight: 1.7,
              color: C.body, background: C.code, border: `1px solid ${C.line}`, borderRadius: 8, padding: 18
            }
          }, text),
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, gap: 12, flexWrap: 'wrap' } },
            h('span', { style: { fontFamily: MONO, fontSize: 11, color: copied ? C.success : C.faint } },
              copied ? 'Copiado para a área de transferência.' : 'Texto formatado para colar no WhatsApp.'),
            h('span', { style: { display: 'flex', gap: 10 } },
              h(Button, { variant: 'ghost', size: 'sm', onClick: onClose }, 'fechar'),
              h(Button, { variant: 'solid', size: 'sm', onClick: onCopy }, 'copiar texto')
            )
          )
        )
      )
    );
  }

  /* =========================================================
     App
     ========================================================= */
  function App() {
    const [state, setStateRaw] = useState(D.initialState);

    const setState = useCallback(patch => {
      setStateRaw(s => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }));
    }, []);

    const scope = useMemo(() => scopeOf(state), [state]);
    const { me, canSee, canEdit, visibleAreas, scoped } = scope;

    /* Log imutável: autor, horário, entidade e o que mudou. */
    const log = useCallback((area, entity, text) => {
      setStateRaw(s => {
        const author = (s.users.find(u => u.id === s.userId) || s.users[0]).name;
        return { ...s, logs: [{ id: `L-${Date.now()}-${s.logs.length}`, ts: stamp(), who: author, area, entity, text }, ...s.logs] };
      });
    }, []);

    /* ---------- recortes ---------- */
    const acts = scoped(state.activities);
    const deals = scoped(state.deals);
    const logs = state.logs.filter(l => canSee(l.area) && (state.area === 'all' || l.area === state.area));
    const areaLabel = state.area === 'all' ? 'todas as áreas' : areaOf(state.area).label;
    const late = acts.filter(a => a.status !== 'concluido' && CRITICAL_DUE.includes(a.due));

    /* ---------- ações ---------- */
    const moveDeal = (id, dir) => {
      const d = state.deals.find(x => x.id === id);
      if (!d || !canEdit(d.area)) return;
      const i = STAGES.findIndex(s => s.key === d.stage);
      const j = Math.max(0, Math.min(STAGES.length - 1, i + dir));
      if (i === j) return;
      setState(s => ({ deals: s.deals.map(x => (x.id === id ? { ...x, stage: STAGES[j].key } : x)) }));
      log(d.area, id, `Moveu ${d.conta} de ${STAGES[i].label} para ${STAGES[j].label}`);
    };

    const dropCard = (id, col) => {
      const a = state.activities.find(x => x.id === id);
      if (!a || a.status === col || !canEdit(a.area)) return;
      const from = statusLabel(a.status);
      setState(s => ({ activities: s.activities.map(x => (x.id === id ? { ...x, status: col } : x)) }));
      log(a.area, id, `Moveu "${a.title}" de ${from} para ${statusLabel(col)}`);
    };

    const patchActivity = (field, value, describe) => {
      const a = state.activities.find(x => x.id === state.selectedId);
      if (!a || !canEdit(a.area) || a[field] === value) return;
      const from = a[field];
      setState(s => ({ activities: s.activities.map(x => (x.id === a.id ? { ...x, [field]: value } : x)) }));
      log(a.area, a.id, describe(from, value));
    };

    const cyclePerm = (uid, area) => {
      if (me.role !== 'Admin') return;
      const u = state.users.find(x => x.id === uid);
      if (!u || u.role === 'Admin') return;
      const order = [null, 'view', 'edit'];
      const next = order[(order.indexOf(u.perms[area] || null) + 1) % 3];
      setState(s => ({ users: s.users.map(x => (x.id === uid ? { ...x, perms: { ...x.perms, [area]: next } } : x)) }));
      log(area, uid, `Definiu permissão de ${u.name} em ${areaOf(area).label} para ${
        next === 'edit' ? 'editar' : next === 'view' ? 'ver' : 'sem acesso'
      }`);
    };

    const copyWa = () => {
      const t = waText(state, scope);
      if (navigator.clipboard) navigator.clipboard.writeText(t).catch(() => {});
      setState({ copied: true });
    };

    /* ---------- login ---------- */
    if (!state.authed) {
      return h(LoginScreen, {
        users: state.users,
        onLogin: uid => setState({ authed: true, userId: uid, view: 'overview', area: 'all' })
      });
    }

    /* ---------- navegação ---------- */
    const navCounts = { atividades: acts.length, comercial: deals.length, operacoes: acts.length, auditoria: logs.length };
    const nav = NAV.filter(n => n.key !== 'admin' || me.role === 'Admin');
    const areaChips = [{ id: 'all', label: 'Todas', color: C.dust }].concat(visibleAreas);

    const kpis = [
      { label: 'ATIVIDADES ABERTAS', value: acts.filter(a => a.status !== 'concluido').length, hint: 'no seu escopo', color: C.ink },
      { label: 'EM ANDAMENTO', value: acts.filter(a => a.status === 'andamento').length, hint: 'execução ativa', color: C.info },
      { label: 'PIPELINE', value: brl(deals.filter(d => d.stage !== 'ganho').reduce((s, d) => s + d.valor, 0)), hint: deals.length + ' oportunidades', color: C.accent },
      { label: 'PRAZO CRÍTICO', value: late.length, hint: 'vencendo esta semana', color: late.length ? C.error : C.success }
    ];

    const maxLoad = Math.max(1, ...visibleAreas.map(a => state.activities.filter(x => x.area === a.id).length));
    const areaLoad = visibleAreas.map(a => {
      const list = state.activities.filter(x => x.area === a.id);
      const done = list.filter(x => x.status === 'concluido').length;
      return {
        label: a.label, color: a.color,
        meta: `${list.length} ativ. · ${done} concluídas`,
        pct: Math.round((list.length / maxLoad) * 100) + '%'
      };
    });

    const stages = STAGES.map(s => {
      const cards = deals.filter(d => d.stage === s.key);
      return {
        key: s.key, label: s.label,
        total: brl(cards.reduce((t, c) => t + c.valor, 0)),
        cards: cards.map(d => ({
          id: d.id, conta: d.conta, escopo: d.escopo, owner: d.owner, prox: d.prox,
          valor: brl(d.valor), color: areaOf(d.area).color,
          editable: canEdit(d.area), ctrl: canEdit(d.area) ? C.dust : C.line
        }))
      };
    });

    const board = STATUS.map(s => {
      const cards = acts.filter(a => a.status === s.key);
      return {
        key: s.key, label: s.label, count: cards.length,
        cards: cards.map(a => ({
          id: a.id, title: a.title, owner: a.owner.split(' ')[0], due: a.due, prio: a.prio,
          areaLabel: areaOf(a.area).short, color: areaOf(a.area).color, drag: canEdit(a.area)
        }))
      };
    });

    const rows = acts.map(a => ({
      id: a.id, title: a.title, tipo: a.tipo, owner: a.owner, due: a.due,
      areaLabel: areaOf(a.area).label, color: areaOf(a.area).color,
      statusLabel: statusLabel(a.status), statusColor: statusColor(a.status),
      dueColor: late.includes(a) ? C.error : C.dust
    }));

    const selected = state.activities.find(a => a.id === state.selectedId) || null;
    const waTabs = [{ id: 'all', label: 'Geral' }].concat(visibleAreas.map(a => ({ id: a.id, label: a.label })));

    const views = {
      overview: () => h(Overview, {
        kpis, areaLoad,
        recentLogs: logs.slice(0, 6)
      }),
      comercial: () => h(Comercial, { stages, onMoveDeal: moveDeal }),
      operacoes: () => h(Operacoes, { board, onDropCard: dropCard, onOpen: id => setState({ selectedId: id }) }),
      atividades: () => h(Atividades, { rows, onOpen: id => setState({ selectedId: id }) }),
      cadastros: () => h(Cadastros, {
        cadTab: state.cadTab,
        onTab: key => setState({ cadTab: key }),
        set: cadastroSet(state, scope, state.cadTab),
        areaOptions: visibleAreas.map(a => a.label),
        cannotEditAny: !visibleAreas.some(a => canEdit(a.id))
      }),
      admin: () => h(Admin, { users: state.users, isAdmin: me.role === 'Admin', onCyclePerm: cyclePerm }),
      auditoria: () => h(Auditoria, { logs })
    };

    return h('div', { className: 'liff-shell' },
      /* ---- sidebar ---- */
      h('aside', { className: 'liff-aside' },
        h('div', { style: { padding: '0 22px 26px' } },
          h(LiffMark, { height: 24, tone: 'light' }),
          h('div', { style: { ...eyebrow(10, C.accent, '0.18em'), marginTop: 10 } }, 'OPS · GESTÃO INTERNA')
        ),
        h('nav', { style: { display: 'flex', flexDirection: 'column' } },
          nav.map(n => {
            const on = state.view === n.key;
            return h('div', {
              key: n.key, className: 'liff-nav-item', onClick: () => setState({ view: n.key }),
              style: {
                padding: '11px 22px', cursor: 'pointer', ...eyebrow(12, on ? C.ink : C.dust, '0.1em'),
                borderLeft: `2px solid ${on ? C.accent : 'transparent'}`,
                background: on ? C.panel : 'transparent',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8
              }
            },
              h('span', null, `/ ${n.label}`),
              h('span', { style: { fontSize: 10, color: C.faint } }, navCounts[n.key] != null ? navCounts[n.key] : '')
            );
          })
        ),
        h('div', { style: { marginTop: 'auto', padding: '26px 22px 0' } },
          h('div', { style: { borderTop: `1px solid ${C.line}`, paddingTop: 18 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 11 } },
              h('div', { style: avatarStyle(32) }, me.initials),
              h('div', { style: { flex: 1, minWidth: 0 } },
                h('div', { style: { fontSize: 13, color: C.ink, fontWeight: 600 } }, me.name),
                h('div', { style: eyebrow(10, C.faint, '0.1em') }, me.role)
              )
            ),
            h('div', { style: { marginTop: 14 } },
              h(Button, {
                variant: 'ghost', size: 'sm',
                onClick: () => setState({ authed: false, selectedId: null, waOpen: false }),
                style: { width: '100%', justifyContent: 'center' }
              }, 'trocar conta')
            )
          )
        )
      ),

      /* ---- conteúdo ---- */
      h('div', { style: { background: C.canvas, display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
        h('header', { className: 'liff-header' },
          h('div', { style: { minWidth: 200 } },
            h('div', { style: eyebrow(10, C.faint) },
              `LIFF/ ${state.view === 'overview' ? 'PAINEL' : state.view.toUpperCase()} · ${areaLabel.toUpperCase()}`),
            h('div', { style: { fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: C.ink } }, TITLES[state.view])
          ),
          h('div', { className: 'liff-area-chips', style: mesh({ display: 'flex', gap: 1, marginLeft: 'auto', flexWrap: 'wrap' }) },
            areaChips.map(chip => {
              const on = state.area === chip.id;
              return h('div', {
                key: chip.id, onClick: () => setState({ area: chip.id }),
                style: {
                  padding: '8px 13px', cursor: 'pointer', ...eyebrow(11, on ? C.ink : C.faint, '0.1em'),
                  background: on ? C.panel2 : C.canvas, display: 'flex', alignItems: 'center', gap: 8
                }
              },
                h('span', { style: { ...dot(chip.color), borderRadius: 2 } }), chip.label
              );
            })
          ),
          h(Button, {
            variant: 'solid', size: 'sm',
            onClick: () => setState({ waOpen: true, waArea: state.area, copied: false })
          }, 'resumo p/ whatsapp')
        ),
        h('main', { className: 'liff-main' }, (views[state.view] || views.overview)())
      ),

      /* ---- overlays ---- */
      selected ? h(Drawer, {
        act: selected,
        editable: canEdit(selected.area),
        logs: state.logs.filter(l => l.entity === selected.id),
        people: state.users.map(u => u.name),
        onClose: () => setState({ selectedId: null }),
        onStatus: k => canEdit(selected.area) && patchActivity('status', k,
          (from, to) => `Alterou status de ${statusLabel(from)} para ${statusLabel(to)}`),
        onOwner: v => patchActivity('owner', v, (from, to) => `Alterou responsável de ${from} para ${to}`),
        onPrio: v => patchActivity('prio', v, (from, to) => `Alterou prioridade de ${from} para ${to}`)
      }) : null,

      state.waOpen ? h(WaModal, {
        tabs: waTabs, waArea: state.waArea, text: waText(state, scope), copied: state.copied,
        onArea: id => setState({ waArea: id, copied: false }),
        onCopy: copyWa,
        onClose: () => setState({ waOpen: false, copied: false })
      }) : null
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(h(App));
})();
