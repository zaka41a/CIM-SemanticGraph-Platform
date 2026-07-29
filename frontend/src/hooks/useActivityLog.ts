import { useEffect, useState } from 'react';
import {
  getActivity,
  subscribeActivity,
  type ActivityEntry,
  type ActivityService,
} from '@/utils/activityLog';

/** Live view of the local activity journal, kept in sync across tabs. */
export function useActivityLog(service?: ActivityService): ActivityEntry[] {
  const [entries, setEntries] = useState<ActivityEntry[]>(() => getActivity(service));

  useEffect(() => {
    setEntries(getActivity(service));
    return subscribeActivity(all => {
      setEntries(service ? all.filter(e => e.service === service) : all);
    });
  }, [service]);

  return entries;
}
