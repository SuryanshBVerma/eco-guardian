# Scheduling eco-guardian Scans

This guide provides instructions on how to automate `eco-guardian` scans on Windows, macOS, and Linux without modifying any source code.

## Windows (Task Scheduler)

You can schedule a weekly scan using either the GUI or a single PowerShell command.

### Option 1: PowerShell (Quickest)
Run PowerShell as Administrator and execute the following command:

```powershell
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c npx github:boredom1234/eco-guardian --severity high --export-html C:\path\to\your\report.html"
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 9pm
Register-ScheduledTask -Action $action -Trigger $trigger -TaskName "EcoGuardianWeeklyScan" -Description "Automated high-severity security scan"
```

### Option 2: Task Scheduler GUI
1. Open Task Scheduler.
2. Click Create Basic Task in the right-hand panel.
3. Name it Eco-Guardian Scan.
4. Trigger: Select Weekly, then choose Monday at 9:00 PM.
5. Action: Select Start a Program.
6. Program/Script: cmd.exe
7. Add selection (arguments): /c npx github:boredom1234/eco-guardian --severity high --export-html C:\path\to\report.html

---

## macOS and Linux (Cron)

On Unix-based systems, cron is the standard tool for scheduling background tasks.

### Setup Instructions
1. Open your user terminal.
2. Open the crontab editor:
   ```bash
   crontab -e
   ```
3. Add the following line at the end of the file:
   ```cron
   0 21 * * 1 /usr/local/bin/npx github:boredom1234/eco-guardian --severity high --export-html /home/username/reports/scan.html
   ```

### Cron Breakdown:
| Field | Value | Description |
|---|---|---|
| Minute | 0 | Top of the hour |
| Hour | 21 | 9:00 PM (24-hour format) |
| Day of Month | * | Every day |
| Month | * | Every month |
| Day of Week | 1 | Monday |

> [!TIP]
> **Use Absolute Paths**: In scheduled environments, your shell profile (like PATH) might not be fully loaded. Always use the absolute path to npx (run which npx to find it) and the absolute path for the output file.

---

## Best Practices

- **Absolute Paths**: Always use absolute paths for export files (e.g., C:\reports\out.html instead of out.html) to ensure the file is saved where you expect.
- **Node.js Environment**: Ensure the user account running the task has Node.js and npm installed.
- **Log Output**: You can append >> /path/to/logfile.log 2>&1 to the commands to save the console output for troubleshooting if the task fails.
