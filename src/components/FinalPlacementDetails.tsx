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
          <div className="font-bold break-words">{detail.name}</div>
          {detail.members.length > 0 && (
            <ul
              aria-label={t('dashboard.members', 'Members')}
              className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs font-normal leading-tight text-gray-500 dark:text-slate-400"
            >
              {detail.members.map((member, memberIndex) => (
                <li key={`${member.name}-${memberIndex}`} className="min-w-0">
                  <span className="break-words">{member.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
