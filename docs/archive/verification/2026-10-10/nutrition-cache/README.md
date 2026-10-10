# Nutrition tab memory and refresh checks

The real Training/Nutrition components were rendered on the existing disposable iOS 26.4 simulator using Expo Go and an isolated fixture origin. Meals and nutrient values are invented; each food/target GET was delayed by 1.5 seconds. No real account, hosted backend, AI request or product write was used.

Switching to Today removed Nutrition controls from the native accessibility tree. Returning showed the already loaded 625 kcal and synthetic meal while a delayed background refresh was still pending, without a draft-restoration or diary-loading replacement. [Rendered return](cached-return.png). The 30-second fresh-data window and reuse of pending reads are separately asserted by component tests with a controlled clock; this screenshot is not a phone benchmark.

Four additional component regressions cover lazy first load, rapid returns, pending-request reuse, background replacement, profile/plan target revalidation, failed refresh/retry, midnight rollover and account-switch isolation including a delayed former-account response. Existing manual logging, receipt recovery, draft persistence, history browsing and calendar tests also pass.

Preview PID `48057` on 8084 and the disposable simulator were stopped after verification. Owner Metro PID `39020` on 8081 was preserved. Physical-phone acceptance remains separate.
