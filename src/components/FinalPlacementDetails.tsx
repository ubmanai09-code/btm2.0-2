import React from 'react';
import type { PlacementDetail } from './dashboardRankings';

export default function FinalPlacementDetails({ details, t }: {
  details: PlacementDetail[];
  t: (key: string, fallback: string) => string;
}) {
  return (
    <div className="space-y-1.5">
      {details.map((detail, index) => (
        <div key={`${detail.name}-${index}`} className="min-w-0">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
            <div className="font-semibold break-words">{detail.name}</div>
            <div className="text-xs font-normal text-gray-500 dark:text-slate-400 tabular-nums">
              {detail.isTeam ? t('dashboard.team_total', 'Team total') : t('dashboard.total', 'Total')}: <span className="font-bold text-emerald-800 dark:text-emerald-400">{detail.total ?? '—'}</span>
              {!detail.isTeam && <> · {t('dashboard.avg', 'Avg')}: {detail.avg !== null ? detail.avg.toFixed(1) : '—'}</>}
            </div>
          </div>
          {detail.members.length > 0 && (
            <ul
              aria-label={t('dashboard.members', 'Members')}
              className="mt-1 grid gap-x-4 gap-y-1 text-xs font-normal leading-tight text-gray-500 dark:text-slate-400 tabular-nums"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 13rem), 1fr))' }}
            >
              {detail.members.map((member, memberIndex) => (
                <li key={`${member.name}-${memberIndex}`} className="min-w-0">
                  <div className="break-words">{member.name}</div>
                  <div>
                    {t('dashboard.total', 'Total')}: <span className="font-semibold">{member.total ?? '—'}</span>
                    {' · '}{t('dashboard.avg', 'Avg')}: <span className="font-semibold">{member.avg != null ? member.avg.toFixed(1) : '—'}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
