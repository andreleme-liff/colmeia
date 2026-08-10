/* LIFF Ops — domínio e dados de partida.
   Áreas, status, estágios e navegação são as constantes do sistema; o restante
   é a carga inicial do protótipo (substituível por uma API sem tocar na UI). */

window.LIFFOpsData = (() => {
  const AREAS = [
    { id: 'law-firms',     label: 'Law Firms',     short: 'LAW',  color: 'var(--liff-law-firms-mid)' },
    { id: 'corporate',     label: 'Corporate',     short: 'CORP', color: 'var(--liff-corporate-mid)' },
    { id: 'public-sector', label: 'Public Sector', short: 'PUB',  color: 'var(--liff-public-sector-mid)' },
    { id: 'tax',           label: 'Tax',           short: 'TAX',  color: 'var(--liff-tax-mid)' },
    { id: 'labs',          label: 'Labs',          short: 'LABS', color: 'var(--liff-labs-core)' },
    { id: 'social',        label: 'Social',        short: 'SOC',  color: 'var(--liff-social-mid)' }
  ];

  const STATUS = [
    { key: 'backlog',   label: 'Backlog' },
    { key: 'andamento', label: 'Em andamento' },
    { key: 'revisao',   label: 'Em revisão' },
    { key: 'concluido', label: 'Concluído' }
  ];

  const STAGES = [
    { key: 'lead',         label: 'Lead' },
    { key: 'qualificacao', label: 'Qualificação' },
    { key: 'proposta',     label: 'Proposta' },
    { key: 'negociacao',   label: 'Negociação' },
    { key: 'ganho',        label: 'Ganho' }
  ];

  const NAV = [
    { key: 'overview',   label: 'visão geral' },
    { key: 'comercial',  label: 'comercial' },
    { key: 'operacoes',  label: 'operações' },
    { key: 'atividades', label: 'atividades' },
    { key: 'cadastros',  label: 'cadastros' },
    { key: 'admin',      label: 'administração' },
    { key: 'auditoria',  label: 'auditoria' }
  ];

  const TITLES = {
    overview: 'Visão geral',
    comercial: 'Pipeline comercial',
    operacoes: 'Quadro operacional',
    atividades: 'Atividades',
    cadastros: 'Cadastros',
    admin: 'Administração',
    auditoria: 'Auditoria'
  };

  const users = [
    { id: 'u1', name: 'André Leme', email: 'andre@liff.com.br', role: 'Admin', initials: 'AL', active: true,
      perms: { 'law-firms': 'edit', corporate: 'edit', 'public-sector': 'edit', tax: 'edit', labs: 'edit', social: 'edit' } },
    { id: 'u2', name: 'Marina Duarte', email: 'marina@liff.com.br', role: 'Gestora comercial', initials: 'MD', active: true,
      perms: { 'law-firms': 'edit', corporate: 'edit', 'public-sector': 'view', tax: 'view', labs: null, social: null } },
    { id: 'u3', name: 'Rafael Nunes', email: 'rafael@liff.com.br', role: 'Líder de operações', initials: 'RN', active: true,
      perms: { 'law-firms': 'view', corporate: 'view', 'public-sector': null, tax: 'edit', labs: 'edit', social: null } },
    { id: 'u4', name: 'Clara Bastos', email: 'clara@liff.com.br', role: 'Analista', initials: 'CB', active: true,
      perms: { 'law-firms': null, corporate: null, 'public-sector': 'view', tax: null, labs: null, social: 'view' } }
  ];

  const activities = [
    { id: 'A-101', title: 'Implantação law-v no escritório Vieira & Costa', area: 'law-firms', tipo: 'Operacional', status: 'andamento', owner: 'Marina Duarte', due: '12/08', prio: 'alta' },
    { id: 'A-102', title: 'Migração de base processual — fase 2', area: 'law-firms', tipo: 'Operacional', status: 'revisao', owner: 'Rafael Nunes', due: '09/08', prio: 'alta' },
    { id: 'A-103', title: 'Proposta comercial Grupo Andrade', area: 'law-firms', tipo: 'Comercial', status: 'backlog', owner: 'Marina Duarte', due: '18/08', prio: 'media' },
    { id: 'A-201', title: 'Rollout Regtrack na área de compliance', area: 'corporate', tipo: 'Operacional', status: 'andamento', owner: 'Rafael Nunes', due: '15/08', prio: 'alta' },
    { id: 'A-202', title: 'Treinamento de governança — turma 3', area: 'corporate', tipo: 'Institucional', status: 'concluido', owner: 'Clara Bastos', due: '01/08', prio: 'baixa' },
    { id: 'A-203', title: 'Revisão de política de retenção documental', area: 'corporate', tipo: 'Operacional', status: 'backlog', owner: 'André Leme', due: '22/08', prio: 'media' },
    { id: 'A-301', title: 'Pregão eletrônico — Tribunal de Contas MG', area: 'public-sector', tipo: 'Comercial', status: 'andamento', owner: 'André Leme', due: '11/08', prio: 'alta' },
    { id: 'A-302', title: 'Integração com sistema de controle interno', area: 'public-sector', tipo: 'Operacional', status: 'backlog', owner: 'Rafael Nunes', due: '29/08', prio: 'baixa' },
    { id: 'A-401', title: 'Motor de cálculo da reforma — CBS/IBS', area: 'tax', tipo: 'Produto', status: 'andamento', owner: 'Rafael Nunes', due: '20/08', prio: 'alta' },
    { id: 'A-402', title: 'DRE Impact para carteira industrial', area: 'tax', tipo: 'Operacional', status: 'revisao', owner: 'André Leme', due: '08/08', prio: 'alta' },
    { id: 'A-403', title: 'Onboarding tributário — Nutrimax', area: 'tax', tipo: 'Comercial', status: 'concluido', owner: 'Marina Duarte', due: '31/07', prio: 'media' },
    { id: 'A-501', title: 'Deadline Agent — avaliação de precisão', area: 'labs', tipo: 'Produto', status: 'andamento', owner: 'Rafael Nunes', due: '14/08', prio: 'alta' },
    { id: 'A-502', title: 'Evidence Graph — protótipo de grafo', area: 'labs', tipo: 'Produto', status: 'backlog', owner: 'André Leme', due: '26/08', prio: 'media' },
    { id: 'A-503', title: 'Benchmark de modelos para extração', area: 'labs', tipo: 'Produto', status: 'revisao', owner: 'Rafael Nunes', due: '10/08', prio: 'media' },
    { id: 'A-601', title: 'Convênio com Defensoria — plano piloto', area: 'social', tipo: 'Institucional', status: 'andamento', owner: 'Clara Bastos', due: '19/08', prio: 'media' },
    { id: 'A-602', title: 'Relatório de impacto do 1º semestre', area: 'social', tipo: 'Institucional', status: 'concluido', owner: 'Clara Bastos', due: '04/08', prio: 'baixa' }
  ];

  const deals = [
    { id: 'D-01', conta: 'Vieira & Costa Advogados', escopo: 'law-v · 80 usuários',     area: 'law-firms',     stage: 'negociacao',   valor: 420000, owner: 'Marina', prox: 'Reunião 08/08' },
    { id: 'D-02', conta: 'Grupo Andrade',           escopo: 'law-v + Docflows',        area: 'law-firms',     stage: 'proposta',     valor: 260000, owner: 'Marina', prox: 'Enviar proposta' },
    { id: 'D-03', conta: 'Metalcorp S.A.',          escopo: 'Regtrack corporate',      area: 'corporate',     stage: 'qualificacao', valor: 180000, owner: 'Marina', prox: 'Discovery 12/08' },
    { id: 'D-04', conta: 'Instituto Vega',          escopo: 'Compliance ESG',          area: 'corporate',     stage: 'lead',         valor: 95000,  owner: 'André',  prox: 'Qualificar' },
    { id: 'D-05', conta: 'Tribunal de Contas MG',   escopo: 'Controle interno',        area: 'public-sector', stage: 'proposta',     valor: 610000, owner: 'André',  prox: 'Edital 11/08' },
    { id: 'D-06', conta: 'Nutrimax Alimentos',      escopo: 'LIFF Tax · DRE Impact',   area: 'tax',           stage: 'ganho',        valor: 340000, owner: 'Marina', prox: 'Kickoff feito' },
    { id: 'D-07', conta: 'Cimentos Boa Vista',      escopo: 'Reforma tributária',      area: 'tax',           stage: 'negociacao',   valor: 275000, owner: 'André',  prox: 'Ajuste de escopo' },
    { id: 'D-08', conta: 'Rede Solidária Brasil',   escopo: 'Acesso à justiça',        area: 'social',        stage: 'lead',         valor: 60000,  owner: 'Clara',  prox: 'Primeiro contato' }
  ];

  const logs = [
    { id: 1, ts: '07/08 09:12', who: 'Rafael Nunes', area: 'labs',          entity: 'A-501', text: 'Moveu "Deadline Agent — avaliação de precisão" de Backlog para Em andamento' },
    { id: 2, ts: '07/08 08:40', who: 'Marina Duarte', area: 'law-firms',    entity: 'D-01',  text: 'Avançou Vieira & Costa para Negociação' },
    { id: 3, ts: '06/08 18:22', who: 'André Leme',   area: 'tax',           entity: 'A-402', text: 'Alterou responsável de Marina Duarte para André Leme' },
    { id: 4, ts: '06/08 16:05', who: 'Clara Bastos', area: 'social',        entity: 'A-602', text: 'Concluiu "Relatório de impacto do 1º semestre"' },
    { id: 5, ts: '06/08 11:31', who: 'André Leme',   area: 'corporate',     entity: 'U-04',  text: 'Concedeu permissão de leitura em Public Sector para Clara Bastos' },
    { id: 6, ts: '05/08 15:47', who: 'Rafael Nunes', area: 'tax',           entity: 'A-401', text: 'Alterou prioridade de média para alta' }
  ];

  const ADMIN_CARDS = [
    { title: 'PAPÉIS',           body: 'Admin, Gestor, Membro e Leitura. O papel define o teto de permissão; a matriz acima refina por área.' },
    { title: 'SSO GOOGLE',       body: 'Login restrito ao domínio liff.com.br. Novos usuários entram sem área atribuída até liberação.' },
    { title: 'RETENÇÃO DE LOG',  body: 'Registro imutável por 24 meses: autor, horário, entidade, campo, valor anterior e novo.' }
  ];

  /* Prazos considerados críticos no recorte do protótipo. */
  const CRITICAL_DUE = ['08/08', '09/08', '04/08', '01/08', '31/07'];

  const initialState = () => ({
    authed: false,
    userId: 'u1',
    view: 'overview',
    area: 'all',
    cadTab: 'contas',
    selectedId: null,
    waOpen: false,
    waArea: 'all',
    copied: false,
    users: users.map(u => ({ ...u, perms: { ...u.perms } })),
    activities: activities.map(a => ({ ...a })),
    deals: deals.map(d => ({ ...d })),
    logs: logs.map(l => ({ ...l }))
  });

  return { AREAS, STATUS, STAGES, NAV, TITLES, ADMIN_CARDS, CRITICAL_DUE, initialState };
})();
