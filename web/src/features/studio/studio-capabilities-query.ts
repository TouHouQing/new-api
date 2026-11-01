/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import { useQuery } from '@tanstack/react-query'

import type { StudioModelCapabilityEntry } from './studio-capabilities'
import { studioCloudRequest } from './studio-cloud'

export function useStudioCapabilityProfiles(enabled = true) {
  return useQuery({
    queryKey: ['studio-model-capability-profiles'],
    queryFn: () =>
      studioCloudRequest<{ profiles: StudioModelCapabilityEntry[] }>(
        '/capability-profiles'
      ),
    enabled,
    staleTime: 30_000,
    retry: false,
    meta: { errorToast: false },
  })
}
