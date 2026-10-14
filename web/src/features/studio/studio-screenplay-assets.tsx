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

import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import type { StudioEditableScreenplay } from './studio-creation'

type Props = {
  draft: StudioEditableScreenplay
  disabled: boolean
  onChange: (draft: StudioEditableScreenplay) => void
}
export function StudioScreenplayAssets(props: Props) {
  const { t } = useTranslation()
  return (
    <div className='grid gap-4 lg:grid-cols-3'>
      {(['characters', 'scenes', 'props'] as const).map((kind) => (
        <section key={kind} className='space-y-3'>
          <h3 className='font-medium'>{t(`studio.production.${kind}`)}</h3>
          {props.draft[kind].map((asset, index) => (
            <div
              key={asset.id}
              className='bg-muted/40 space-y-2 rounded-lg p-3'
            >
              <Field>
                <FieldLabel>{t('Name')}</FieldLabel>
                <Input
                  aria-label={t('Name')}
                  disabled={props.disabled}
                  value={asset.title}
                  maxLength={200}
                  onChange={(event) =>
                    props.onChange({
                      ...props.draft,
                      [kind]: props.draft[kind].map((item) =>
                        item.id === asset.id
                          ? { ...item, title: event.target.value }
                          : item
                      ),
                    })
                  }
                />
              </Field>
              <Field>
                <FieldLabel>{t('Description')}</FieldLabel>
                <Textarea
                  aria-label={t('Description')}
                  disabled={props.disabled}
                  value={asset.description}
                  maxLength={10000}
                  onChange={(event) =>
                    props.onChange({
                      ...props.draft,
                      [kind]: props.draft[kind].map((item) =>
                        item.id === asset.id
                          ? { ...item, description: event.target.value }
                          : item
                      ),
                    })
                  }
                />
              </Field>
              <Button
                size='xs'
                variant='ghost'
                disabled={props.disabled}
                onClick={() =>
                  props.onChange({
                    ...props.draft,
                    [kind]: props.draft[kind].filter((_, i) => i !== index),
                    shots: props.draft.shots.map((shot) => ({
                      ...shot,
                      characterIds:
                        kind === 'characters'
                          ? shot.characterIds.filter((id) => id !== asset.id)
                          : shot.characterIds,
                      propIds:
                        kind === 'props'
                          ? shot.propIds.filter((id) => id !== asset.id)
                          : shot.propIds,
                      sceneId:
                        kind === 'scenes' && shot.sceneId === asset.id
                          ? undefined
                          : shot.sceneId,
                    })),
                  })
                }
              >
                {t('Remove from draft')}
              </Button>
            </div>
          ))}
          <Button
            size='sm'
            variant='outline'
            disabled={
              props.disabled ||
              props.draft[kind].length >= (kind === 'characters' ? 20 : 30)
            }
            onClick={() =>
              props.onChange({
                ...props.draft,
                [kind]: [
                  ...props.draft[kind],
                  {
                    id: `asset_${crypto.randomUUID()}`,
                    title: t('New asset'),
                    description: '',
                  },
                ],
              })
            }
          >
            {t('Add asset')}
          </Button>
        </section>
      ))}
    </div>
  )
}
