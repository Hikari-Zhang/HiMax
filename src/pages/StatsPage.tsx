import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store'
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip
} from 'recharts'
import { Download, HardDrive, Calendar, TrendingUp, BarChart3 } from 'lucide-react'

function StatCard({ icon: Icon, label, value, subValue, color }: {
  icon: typeof Download
  label: string
  value: string | number
  subValue?: string
  color: string
}) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-bg-secondary">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-xl font-bold text-text-primary">{value}</p>
        <p className="text-xs text-text-muted">{label}</p>
      </div>
      {subValue && (
        <span className="ml-auto text-xs text-text-muted">{subValue}</span>
      )}
    </div>
  )
}

export function StatsPage() {
  const { t } = useTranslation()
  const { stats, loadStats } = useAppStore()

  useEffect(() => {
    loadStats()
  }, [loadStats])

  // Loading state
  if (!stats) {
    return (
      <div className="space-y-6">
        <h1 className="text-base font-semibold text-text-primary">{t('stats.title')}</h1>
        <div className="flex items-center justify-center h-64 text-text-muted">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">{t('stats.loading', { defaultValue: '加载统计数据...' })}</span>
          </div>
        </div>
      </div>
    )
  }

  // Empty state
  const isEmpty = stats.totalDownloads === 0

  return (
    <div className="space-y-6">
      <h1 className="text-base font-semibold text-text-primary">{t('stats.title')}</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          icon={Download}
          label={t('stats.totalDownloads')}
          value={stats.totalDownloads.toLocaleString()}
          color="bg-accent/15 text-accent"
        />
        <StatCard
          icon={HardDrive}
          label={t('stats.totalSize')}
          value={stats.totalSize}
          color="bg-success/15 text-success"
        />
        <StatCard
          icon={Calendar}
          label={t('stats.todayDownloads')}
          value={stats.todayDownloads}
          color="bg-info/15 text-info"
        />
        <StatCard
          icon={TrendingUp}
          label={t('stats.weekDownloads')}
          value={stats.weekDownloads}
          color="bg-warning/15 text-warning"
        />
      </div>

      {isEmpty ? (
        /* Empty state when no downloads yet */
        <div className="flex flex-col items-center justify-center py-16 text-text-muted">
          <BarChart3 size={48} className="mb-3 opacity-30" />
          <p className="text-sm">{t('stats.noData', { defaultValue: '还没有下载记录，完成下载后这里会显示统计数据' })}</p>
        </div>
      ) : (
        <>
          {/* Charts Row */}
          <div className="grid grid-cols-2 gap-4">
            {/* Source Distribution */}
            <div className="p-4 rounded-xl border border-border bg-bg-secondary">
              <h2 className="text-sm font-medium text-text-primary mb-4">{t('stats.sourceDistribution')}</h2>
              {stats.sourceDistribution.length > 0 ? (
                <div className="flex items-center gap-4">
                  <div className="w-40 h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stats.sourceDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={35}
                          outerRadius={65}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {stats.sourceDistribution.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2">
                    {stats.sourceDistribution.map((item) => (
                      <div key={item.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
                          <span className="text-text-secondary">{item.name}</span>
                        </div>
                        <span className="font-medium text-text-primary">{item.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-40 text-text-muted text-xs">
                  {t('stats.noData', { defaultValue: '暂无数据' })}
                </div>
              )}
            </div>

            {/* Format Distribution */}
            <div className="p-4 rounded-xl border border-border bg-bg-secondary">
              <h2 className="text-sm font-medium text-text-primary mb-4">{t('stats.formatDistribution')}</h2>
              {stats.formatDistribution.length > 0 ? (
                <div className="flex items-center gap-4">
                  <div className="w-40 h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stats.formatDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={35}
                          outerRadius={65}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {stats.formatDistribution.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2">
                    {stats.formatDistribution.map((item) => (
                      <div key={item.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
                          <span className="text-text-secondary">{item.name}</span>
                        </div>
                        <span className="font-medium text-text-primary">{item.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-40 text-text-muted text-xs">
                  {t('stats.noData', { defaultValue: '暂无数据' })}
                </div>
              )}
            </div>
          </div>

          {/* Daily Trend */}
          <div className="p-4 rounded-xl border border-border bg-bg-secondary">
            <h2 className="text-sm font-medium text-text-primary mb-4">{t('stats.dailyTrend')}</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.dailyTrend}>
                  <defs>
                    <linearGradient id="colorDownloads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#666', fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: '#333' }}
                  />
                  <YAxis
                    tick={{ fill: '#666', fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: '#333' }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #333',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: '#a0a0a0' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="downloads"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorDownloads)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
