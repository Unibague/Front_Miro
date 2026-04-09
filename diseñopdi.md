export default function PdiDashboardMockup() {
  const stats = [
    {
      title: "Total Macroproyectos",
      value: "12",
      subtitle: "3 en estado crítico",
      icon: "📚",
      badge: "Crítico",
      badgeClass: "bg-red-100 text-red-600",
    },
    {
      title: "Avance Promedio",
      value: "45%",
      subtitle: "6 de 12 macroproyectos",
      icon: "📈",
      badge: "En progreso",
      badgeClass: "bg-blue-100 text-blue-600",
    },
    {
      title: "Indicadores Críticos",
      value: "7",
      subtitle: "Requieren seguimiento",
      icon: "🚨",
      badge: "Atención",
      badgeClass: "bg-amber-100 text-amber-600",
    },
    {
      title: "Responsables Pendientes",
      value: "5",
      subtitle: "Con tareas por revisar",
      icon: "👥",
      badge: "Pendiente",
      badgeClass: "bg-orange-100 text-orange-600",
    },
  ];

  const macroprojects = [
    {
      title: "Transformación Digital",
      progress: 79,
      status: "Correcto",
      statusClass: "bg-emerald-100 text-emerald-700",
      projects: 6,
      actions: 15,
      indicators: 32,
      owner: "María García",
    },
    {
      title: "Innovación Educativa",
      progress: 62,
      status: "Correcto",
      statusClass: "bg-emerald-100 text-emerald-700",
      projects: 8,
      actions: 18,
      indicators: 49,
      owner: "Carlos Pérez",
    },
    {
      title: "Proyecto Mega",
      progress: 28,
      status: "En riesgo",
      statusClass: "bg-amber-100 text-amber-700",
      projects: 4,
      actions: 12,
      indicators: 21,
      owner: "John Doe",
    },
    {
      title: "Proyecto Alfa",
      progress: 17,
      status: "Atrasado",
      statusClass: "bg-orange-100 text-orange-700",
      projects: 3,
      actions: 5,
      indicators: 11,
      owner: "Luis Rojas",
    },
    {
      title: "Fortalecimiento Institucional",
      progress: 14,
      status: "Crítico",
      statusClass: "bg-red-100 text-red-700",
      projects: 5,
      actions: 8,
      indicators: 23,
      owner: "Jane Doe",
    },
    {
      title: "Investigación Académica",
      progress: 56,
      status: "Correcto",
      statusClass: "bg-emerald-100 text-emerald-700",
      projects: 7,
      actions: 15,
      indicators: 23,
      owner: "Ana Torres",
    },
  ];

  const progressWidthClass = (value: number) => {
    if (value >= 70) return "w-[79%]";
    if (value >= 60) return "w-[62%]";
    if (value >= 50) return "w-[56%]";
    if (value >= 25) return "w-[28%]";
    if (value >= 15) return "w-[17%]";
    return "w-[14%]";
  };

  const progressColorClass = (value: number) => {
    if (value >= 50) return "bg-emerald-500";
    if (value >= 25) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white/70 backdrop-blur xl:flex xl:flex-col">
          <div className="border-b border-slate-200 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-2xl">
                📊
              </div>
              <div>
                <p className="text-xl font-bold">PDI</p>
                <p className="text-sm text-slate-500">Plan institucional</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-2 p-4">
            <button className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-slate-600 transition hover:bg-slate-100">
              <span>🏠</span>
              <span>Inicio</span>
            </button>
            <button className="flex w-full items-center gap-3 rounded-2xl bg-violet-600 px-4 py-3 text-left font-medium text-white shadow-lg shadow-violet-200">
              <span>🗂️</span>
              <span>Seguimiento PDI</span>
            </button>
            <button className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-slate-600 transition hover:bg-slate-100">
              <span>📁</span>
              <span>Reportes</span>
            </button>
            <button className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-slate-600 transition hover:bg-slate-100">
              <span>⚙️</span>
              <span>Configuración</span>
            </button>
          </nav>

          <div className="m-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 font-semibold text-violet-700">
                JD
              </div>
              <div>
                <p className="font-semibold">John Doe</p>
                <p className="text-sm text-slate-500">Administrador general</p>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex-1">
          <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Plan de Desarrollo Institucional</h1>
                <p className="mt-1 text-sm text-slate-500">Seguimiento PDI — Vista general</p>
              </div>
              <button className="rounded-2xl bg-violet-600 px-5 py-3 font-medium text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700">
                + Nuevo macroproyecto
              </button>
            </div>
          </header>

          <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm xl:col-span-1">
                <p className="text-sm text-slate-500">Año</p>
                <p className="mt-1 font-semibold">2024</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm xl:col-span-1">
                <p className="text-sm text-slate-500">Dependencia</p>
                <p className="mt-1 font-semibold">Todas</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm xl:col-span-1">
                <p className="text-sm text-slate-500">Estado</p>
                <p className="mt-1 font-semibold">Todos</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm xl:col-span-1">
                <p className="text-sm text-slate-500">Filtro</p>
                <p className="mt-1 font-semibold">Fecha</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm xl:col-span-1">
                <p className="text-sm text-slate-500">Buscar</p>
                <p className="mt-1 font-semibold text-slate-400">Macroproyecto o responsable</p>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.title} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
                      {stat.icon}
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${stat.badgeClass}`}>
                      {stat.badge}
                    </span>
                  </div>
                  <p className="mt-4 text-sm text-slate-500">{stat.title}</p>
                  <p className="mt-1 text-4xl font-bold tracking-tight">{stat.value}</p>
                  <p className="mt-2 text-sm text-slate-500">{stat.subtitle}</p>
                </div>
              ))}
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold">Progreso General</h2>
                  <p className="text-sm text-slate-500">Seguimiento acumulado de los macroproyectos</p>
                </div>
                <div className="rounded-full bg-violet-100 px-4 py-2 text-sm font-medium text-violet-700">
                  Avance general: 45%
                </div>
              </div>

              <div className="mt-8 h-72 rounded-[24px] bg-gradient-to-b from-violet-50 to-white p-6">
                <div className="flex h-full items-end justify-between gap-3">
                  {[18, 22, 30, 45, 42, 70, 82].map((value, index) => (
                    <div key={index} className="flex h-full flex-1 flex-col items-center justify-end gap-3">
                      <div className="text-xs text-slate-400">{value}%</div>
                      <div
                        className="w-full rounded-t-3xl bg-gradient-to-t from-violet-500 to-violet-300"
                        style={{ height: `${value}%` }}
                      />
                      <div className="text-xs text-slate-400">
                        {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul'][index]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold">Macroproyectos</h2>
                  <p className="text-sm text-slate-500">Vista tipo portfolio para navegar la jerarquía del PDI</p>
                </div>
                <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-500 shadow-sm">
                  6 resultados
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
                {macroprojects.map((item) => (
                  <article
                    key={item.title}
                    className="group rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-2xl font-semibold tracking-tight">{item.title}</h3>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.statusClass}`}>
                        {item.status}
                      </span>
                    </div>

                    <div className="mt-5 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-4xl font-bold">{item.progress}%</p>
                        <p className="text-sm text-slate-500">Avance consolidado</p>
                      </div>
                    </div>

                    <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${progressWidthClass(item.progress)} ${progressColorClass(item.progress)}`}
                      />
                    </div>

                    <div className="mt-5 grid grid-cols-3 gap-3 rounded-2xl bg-slate-50 p-4 text-center">
                      <div>
                        <p className="text-2xl font-bold">{item.projects}</p>
                        <p className="text-xs text-slate-500">Proyectos</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{item.actions}</p>
                        <p className="text-xs text-slate-500">Acciones</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{item.indicators}</p>
                        <p className="text-xs text-slate-500">Indicadores</p>
                      </div>
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Responsable</p>
                        <p className="mt-1 font-semibold">{item.owner}</p>
                      </div>
                      <button className="rounded-2xl bg-violet-100 px-4 py-2 font-medium text-violet-700 transition group-hover:bg-violet-600 group-hover:text-white">
                        Ver detalles →
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
