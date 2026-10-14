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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import { studioProductionSchema } from './studio-production'
import { useStudioProductionContext } from './studio-production-context'

export function StudioProductionContinuity() {
  const { t } = useTranslation()
  const { props, writable } = useStudioProductionContext()
  const [shotId, setShotId] = useState(props.project.shots?.[0]?.id || '')
  const [assetId, setAssetId] = useState(props.project.assets?.[0]?.id || '')
  const production =
    props.project.production || studioProductionSchema.parse({})
  const state = production.continuityStates.find(
    (item) => item.shotId === shotId && item.assetId === assetId
  ) || {
    shotId,
    assetId,
    wardrobe: '',
    emotion: '',
    propState: '',
    note: '',
    referenceMediaIds: [],
  }
  const asset = props.project.assets?.find((asset) => asset.id === assetId)
  function update(patch: Partial<typeof state>) {
    const next = { ...state, ...patch }
    const shot = props.project.shots?.find((shot) => shot.id === shotId)
    const changeId = `continuity-${shotId}-${assetId}`
    props.onUpdate({
      ...props.project,
      production: {
        ...production,
        continuityStates: [
          ...production.continuityStates.filter(
            (item) => item.shotId !== shotId || item.assetId !== assetId
          ),
          next,
        ],
        changes: [
          ...production.changes.filter((change) => change.id !== changeId),
          {
            id: changeId,
            kind: 'script' as const,
            message: `${t('studio.production.continuityChanged')}: ${shot?.title || shotId}`,
            nodeIds: shot ? [shot.imageNodeId, shot.videoNodeId] : [],
            status: 'pending' as const,
            createdAt: new Date().toISOString(),
          },
        ].slice(-200),
      },
    })
  }
  if (!props.project.shots?.length || !props.project.assets?.length) return null
  return (
    <div className='space-y-3 rounded-lg border p-3'>
      <p className='font-medium'>{t('studio.production.shotContinuity')}</p>
      <Select
        value={shotId}
        onValueChange={(value) => setShotId(value || '')}
        items={props.project.shots.map((shot) => ({
          value: shot.id,
          label: shot.title,
        }))}
      >
        <SelectTrigger aria-label={t('studio.production.shot')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {props.project.shots.map((shot) => (
            <SelectItem key={shot.id} value={shot.id}>
              {shot.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={assetId}
        items={props.project.assets.map((asset) => ({
          value: asset.id,
          label: asset.title,
        }))}
        onValueChange={(value) => setAssetId(value || '')}
      >
        <SelectTrigger aria-label={t('studio.production.character')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {props.project.assets.map((asset) => (
            <SelectItem key={asset.id} value={asset.id}>
              {asset.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        disabled={!writable}
        value={state.versionId || 'current'}
        items={[
          { value: 'current', label: t('studio.production.currentTake') },
          ...(asset?.versions || []).map((version, index) => ({
            value: version.id,
            label: `${t('Take')} ${index + 1}`,
          })),
        ]}
        onValueChange={(value) =>
          update({
            versionId: value === 'current' ? undefined : value || undefined,
          })
        }
      >
        <SelectTrigger aria-label={t('studio.production.referenceVersion')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='current'>
            {t('studio.production.currentTake')}
          </SelectItem>
          {asset?.versions?.map((version, index) => (
            <SelectItem key={version.id} value={version.id}>
              {t('Take')} {index + 1}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {(['wardrobe', 'emotion', 'propState', 'note'] as const).map((field) => (
        <Field key={field}>
          <FieldLabel>{t(`studio.production.${field}`)}</FieldLabel>
          <Textarea
            disabled={!writable}
            aria-label={t(`studio.production.${field}`)}
            value={state[field]}
            maxLength={2000}
            onChange={(event) => update({ [field]: event.target.value })}
          />
        </Field>
      ))}
      <fieldset className='flex flex-wrap gap-3'>
        <legend>{t('studio.production.multiviewReferences')}</legend>
        {asset?.versions
          ?.filter((version) => version.mediaId)
          .map((version, index) => (
            <label key={version.id} className='flex items-center gap-2'>
              <Checkbox
                disabled={!writable}
                checked={state.referenceMediaIds.includes(
                  version.mediaId || ''
                )}
                onCheckedChange={(checked) =>
                  update({
                    referenceMediaIds: checked
                      ? [
                          ...new Set([
                            ...state.referenceMediaIds,
                            ...(version.mediaId ? [version.mediaId] : []),
                          ]),
                        ]
                      : state.referenceMediaIds.filter(
                          (id) => id !== version.mediaId
                        ),
                  })
                }
              />
              Take {index + 1}
            </label>
          ))}
      </fieldset>
    </div>
  )
}
