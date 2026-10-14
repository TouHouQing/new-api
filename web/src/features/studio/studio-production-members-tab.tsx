/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TabsContent } from '@/components/ui/tabs'

import { studioCloudRequest } from './studio-cloud'
import { useStudioProductionContext } from './studio-production-context'

export function StudioProductionMembersTab() {
  const { t } = useTranslation()
  const {
    path,
    memberId,
    setMemberId,
    memberRole,
    setMemberRole,
    record,
    members,
    mutate,
  } = useStudioProductionContext()
  return (
    <TabsContent value='members' className='space-y-4'>
      <Field>
        <FieldLabel>{t('Collaborator username or account ID')}</FieldLabel>
        <Input
          value={memberId}
          aria-label={t('Collaborator username or account ID')}
          disabled={record.data?.role !== 'owner'}
          onChange={(event) => setMemberId(event.target.value)}
        />
      </Field>
      <Select
        value={memberRole}
        disabled={record.data?.role !== 'owner'}
        items={['editor', 'reviewer', 'viewer'].map((role) => ({
          value: role,
          label: t(`studio.production.role.${role}`),
        }))}
        onValueChange={(value) => {
          if (value) setMemberRole(value)
        }}
      >
        <SelectTrigger aria-label={t('studio.production.permission')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {['editor', 'reviewer', 'viewer'].map((role) => (
            <SelectItem key={role} value={role}>
              {t(`studio.production.role.${role}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        disabled={
          record.data?.role !== 'owner' || !memberId.trim() || mutate.isPending
        }
        onClick={() =>
          mutate.mutate(() =>
            studioCloudRequest(`${path}/members`, 'PUT', {
              ...(/^\d+$/.test(memberId.trim())
                ? { user_id: Number(memberId) }
                : { username: memberId.trim() }),
              role: memberRole,
            })
          )
        }
      >
        {t('studio.production.invite')}
      </Button>
      {members.data?.map((member) => (
        <div
          key={member.user_id}
          className='flex items-center gap-3 rounded-lg border p-3'
        >
          <span className='min-w-0 break-words'>
            {member.display_name || member.username || member.user_id}
            {member.display_name && member.username && (
              <span className='text-muted-foreground'>
                {' '}
                · @{member.username}
              </span>
            )}
          </span>
          <Badge variant='secondary'>
            {t(`studio.production.role.${member.role}`)}
          </Badge>
          <Button
            className='ml-auto'
            size='xs'
            variant='outline'
            disabled={record.data?.role !== 'owner' || mutate.isPending}
            onClick={() =>
              mutate.mutate(() =>
                studioCloudRequest(`${path}/members`, 'DELETE', {
                  user_id: member.user_id,
                })
              )
            }
          >
            {t('studio.production.removeMember')}
          </Button>
        </div>
      ))}
    </TabsContent>
  )
}
