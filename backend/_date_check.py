from datetime import datetime, timezone, timedelta
lagos = timezone(timedelta(hours=1))
now = datetime.now(lagos)
print("Now (Lagos):", now.strftime("%Y-%m-%d %H:%M"))
print("Now (UTC):  ", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"))
print("Tomorrow (Lagos):", (now + timedelta(days=1)).strftime("%Y-%m-%d"))
print("The pipeline was run for 2026-06-16 (today) which has no fixtures.")
print("The scheduler schedules quantPipeline for 19:00 Lagos DAILY.")
print("Auto-recovery triggered at 08:27 because no predictions existed for today.")
