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
import { Link, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { useStatus } from '@/hooks/use-status'

import { AuthLayout } from '../auth-layout'
import { TermsFooter } from '../components/terms-footer'
import { UserAuthForm } from './components/user-auth-form'

export function SignIn() {
  const { t } = useTranslation()
  const { redirect } = useSearch({ from: '/(auth)/sign-in' })
  const { status } = useStatus()

  return (
    <AuthLayout
      intro={
        redirect?.startsWith('/studio') ? (
          <>
            <h2 className='text-4xl leading-tight font-semibold'>
              {t('Turn your idea into a video')}
            </h2>
            <p className='text-muted-foreground text-lg'>
              {t(
                'Start with an idea, your footage or a template. Finish with pictures, sound and a shareable film.'
              )}
            </p>
            <figure>
              <img
                src='/studio-examples/store-cover-b66a5672.jpg'
                alt={t('Local model example')}
                className='max-h-80 w-full rounded-xl object-cover'
              />
              <figcaption className='text-muted-foreground mt-2 text-sm'>
                {t('Local model example')} · 12s
              </figcaption>
            </figure>
          </>
        ) : undefined
      }
    >
      <div className='w-full space-y-8'>
        <div className='space-y-2'>
          <h2 className='text-center text-2xl font-semibold tracking-tight sm:text-left'>
            {t(
              redirect?.startsWith('/studio')
                ? 'Sign in to the video studio'
                : 'Sign in'
            )}
          </h2>
          {!status?.self_use_mode_enabled &&
            status?.register_enabled !== false && (
              <p className='text-muted-foreground text-left text-sm sm:text-base'>
                {t("Don't have an account?")}{' '}
                <Link
                  to='/sign-up'
                  className='hover:text-primary font-medium underline underline-offset-4'
                >
                  {t('Sign up')}
                </Link>
                .
              </p>
            )}
        </div>

        <UserAuthForm redirectTo={redirect} />

        <TermsFooter
          variant='sign-in'
          status={status}
          className='text-center'
        />
      </div>
    </AuthLayout>
  )
}
