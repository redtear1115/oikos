import { redirect } from 'next/navigation'

export default function RecurringIncomeRedirect() {
  redirect('/settings/recurring?tab=income')
}
