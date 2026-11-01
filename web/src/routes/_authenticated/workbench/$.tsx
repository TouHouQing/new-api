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
import { createFileRoute, redirect } from '@tanstack/react-router'

// Login and dashboard navigation can arrive through the host SPA. Load the
// workbench document so its own router receives the complete nested route.
export const Route = createFileRoute('/_authenticated/workbench/$')({
  beforeLoad: () => {
    const target = new URL(window.location.href)
    if (target.pathname === '/workbench') target.pathname = '/workbench/'
    throw redirect({ href: target.href, reloadDocument: true })
  },
  component: () => null,
})
