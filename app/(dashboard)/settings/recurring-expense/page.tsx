import { redirect } from 'next/navigation'

export default function RecurringExpenseRedirect() {
  redirect('/settings/recurring?tab=expense')
}
