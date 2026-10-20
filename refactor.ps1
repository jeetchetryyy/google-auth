# ============================================================
# test-e2e.ps1 — E2E test: signup -> onboarding -> dashboard -> logout -> login
# Compatible with Windows PowerShell 5.1 AND PowerShell 7+
# Prereq: node server.js is running on :3000
# Usage:  .\test-e2e.ps1
# If blocked: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
# ============================================================

$ErrorActionPreference = "Continue"
$BASE = "http://localhost:3000"
$script:pass = 0
$script:fail = 0

function Assert($name, $cond, $detail = "") {
  if ($cond) {
    Write-Host "  PASS  $name" -ForegroundColor Green
    $script:pass++
  } else {
    Write-Host "  FAIL  $name  $detail" -ForegroundColor Red
    $script:fail++
  }
}

function Section($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }

# Wrapper that NEVER throws — returns { Status, Content, Headers }
function Http($method, $url, $session, $body = $null, $headers = $null) {
  $params = @{
    Uri             = $url
    Method          = $method
    UseBasicParsing = $true
    WebSession      = $session
    TimeoutSec      = 15
  }
  if ($body)    { $params.Body        = $body; $params.ContentType = "application/json" }
  if ($headers) { $params.Headers     = $headers }

  try {
    $r = Invoke-WebRequest @params
    return @{ Status = [int]$r.StatusCode; Content = $r.Content; Headers = $r.Headers }
  } catch [System.Net.WebException] {
    if ($_.Exception.Response) {
      $resp = $_.Exception.Response
      $status = [int]$resp.StatusCode
      $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
      $content = $reader.ReadToEnd()
      $reader.Close()
      return @{ Status = $status; Content = $content; Headers = $resp.Headers }
    }
    return @{ Status = 0; Content = ""; Error = $_.Exception.Message }
  } catch {
    return @{ Status = 0; Content = ""; Error = $_.Exception.Message }
  }
}

# Unique test user
$email    = "e2e+$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())@example.com"
$password = "TestPassword123!"
$session  = New-Object Microsoft.PowerShell.Commands.WebRequestSession

# ------------------------------------------------------------
Section "0. Server reachable?"

$r = Http GET "$BASE/api/auth-state" $session
if ($r.Status -eq 0) {
  Write-Host "  Cannot reach $BASE — is 'node server.js' running in another window?" -ForegroundColor Red
  Write-Host "  Error: $($r.Error)" -ForegroundColor Red
  exit 1
}
Assert "GET /api/auth-state -> 200" ($r.Status -eq 200) "got: $($r.Status)"

# ------------------------------------------------------------
Section "1. Unauthenticated state"

$body = $r.Content | ConvertFrom-Json
Assert "authenticated = false" ($body.authenticated -eq $false) "got: $($r.Content)"
Assert "redirect = login page"  ($body.redirect -eq "/public/auth/login.html") "got: $($body.redirect)"

$r = Http GET "$BASE/api/me" $session
Assert "/api/me -> 401 without session" ($r.Status -eq 401) "got: $($r.Status)"

# ------------------------------------------------------------
Section "2. Static pages & bundles load"

foreach ($p in @(
  "/public/auth/login.html",
  "/public/auth/signup.html",
  "/public/onboarding/",
  "/public/dashboard/",
  "/public/shared/base.css",
  "/public/auth/auth.css",
  "/public/js/auth-login.js",
  "/public/js/auth-signup.js",
  "/public/js/onboarding.js",
  "/public/js/dashboard.js"
)) {
  $r = Http GET "$BASE$p" $session
  Assert "GET $p -> 200" ($r.Status -eq 200) "got: $($r.Status)"
}

# ------------------------------------------------------------
Section "3. Signup"

$signupBody = @{
  formFields = @(
    @{ id = "email";    value = $email },
    @{ id = "password"; value = $password }
  )
} | ConvertTo-Json -Depth 5

$r = Http POST "$BASE/auth/signup" $session $signupBody @{
  rid = "emailpassword"; "fdi-version" = "4.1"; "st-auth-mode" = "cookie"
}
Assert "signup HTTP 200" ($r.Status -eq 200) "got $($r.Status): $($r.Content)"
$body = $r.Content | ConvertFrom-Json
Assert "signup status = OK" ($body.status -eq "OK") "got: $($body.status)"

$cookieCount = ($session.Cookies.GetCookies($BASE) | Where-Object { $_.Name -like "st-*" }).Count
Assert "session cookie set" ($cookieCount -gt 0) "cookie count: $cookieCount"

# ------------------------------------------------------------
Section "4. After signup -> needs onboarding"

$r = Http GET "$BASE/api/auth-state" $session
$body = $r.Content | ConvertFrom-Json
Assert "authenticated = true"       ($body.authenticated -eq $true)
Assert "onboardingComplete = false" ($body.onboardingComplete -eq $false)
Assert "redirect = onboarding"      ($body.redirect -eq "/public/onboarding/") "got: $($body.redirect)"

# ------------------------------------------------------------
Section "5. Onboarding validation rejects bad input"

$bad = @{
  monthlyIncome     = -5
  monthlyExpenses   = "abc"
  savingsBalance    = 100
  investmentBalance = 200
  primaryCurrency   = "XYZ"
  employmentType    = "wizard"
  riskTolerance     = "extreme"
} | ConvertTo-Json

$r = Http POST "$BASE/api/onboarding" $session $bad
Assert "bad payload -> 400" ($r.Status -eq 400) "got: $($r.Status)"

$body = $r.Content | ConvertFrom-Json
$fieldCount = ($body.fields.PSObject.Properties | Measure-Object).Count
Assert "returns >=5 field errors" ($fieldCount -ge 5) "got $fieldCount fields: $($r.Content)"

$r = Http POST "$BASE/api/onboarding" $session "{}"
Assert "empty payload -> 400" ($r.Status -eq 400) "got: $($r.Status)"

# ------------------------------------------------------------
Section "6. Onboarding accepts valid input"

$good = @{
  monthlyIncome     = 85000
  monthlyExpenses   = 42000
  savingsBalance    = 250000
  investmentBalance = 500000
  primaryCurrency   = "INR"
  employmentType    = "salaried"
  riskTolerance     = "medium"
} | ConvertTo-Json

$r = Http POST "$BASE/api/onboarding" $session $good
Assert "valid payload -> 200" ($r.Status -eq 200) "got $($r.Status): $($r.Content)"
$body = $r.Content | ConvertFrom-Json
Assert "success = true" ($body.success -eq $true)

# ------------------------------------------------------------
Section "7. After onboarding -> dashboard"

$r = Http GET "$BASE/api/auth-state" $session
$body = $r.Content | ConvertFrom-Json
Assert "onboardingComplete = true" ($body.onboardingComplete -eq $true)
Assert "redirect = dashboard"       ($body.redirect -eq "/public/dashboard/") "got: $($body.redirect)"

# ------------------------------------------------------------
Section "8. /api/me returns full profile"

$r = Http GET "$BASE/api/me" $session
$body = $r.Content | ConvertFrom-Json
Assert "/api/me success"          ($body.success -eq $true)
Assert "email matches signup"     ($body.user.email -eq $email) "got: $($body.user.email)"
Assert "onboarding present"       ($null -ne $body.onboarding)
Assert "monthlyIncome = 85000"    ($body.onboarding.monthlyIncome -eq 85000)
Assert "primaryCurrency = INR"    ($body.onboarding.primaryCurrency -eq "INR")
Assert "riskTolerance = medium"   ($body.onboarding.riskTolerance -eq "medium")

# ------------------------------------------------------------
Section "9. Cache hits on repeat /api/me"

$r1 = Http GET "$BASE/api/me" $session
$r2 = Http GET "$BASE/api/me" $session
$b1 = $r1.Content | ConvertFrom-Json
$b2 = $r2.Content | ConvertFrom-Json
Assert "repeat /api/me served from cache" ($b2._cacheHit -eq $true) "b1=$($b1._cacheHit) b2=$($b2._cacheHit)"

# ------------------------------------------------------------
Section "10. Idempotent onboarding (update, not duplicate)"

$good2 = $good | ConvertFrom-Json
$good2.monthlyIncome = 90000

$r = Http POST "$BASE/api/onboarding" $session ($good2 | ConvertTo-Json)
Assert "re-submit -> 200" ($r.Status -eq 200)

$r = Http GET "$BASE/api/me" $session
$body = $r.Content | ConvertFrom-Json
Assert "monthlyIncome updated to 90000" ($body.onboarding.monthlyIncome -eq 90000) "got: $($body.onboarding.monthlyIncome)"

# ------------------------------------------------------------
Section "11. Logout"

$r = Http POST "$BASE/api/logout" $session
Assert "logout -> 200" ($r.Status -eq 200) "got: $($r.Status)"

$r = Http GET "$BASE/api/auth-state" $session
$body = $r.Content | ConvertFrom-Json
Assert "not authenticated after logout" ($body.authenticated -eq $false)

# ------------------------------------------------------------
Section "12. Log back in -> straight to dashboard"

$signinBody = @{
  formFields = @(
    @{ id = "email";    value = $email },
    @{ id = "password"; value = $password }
  )
} | ConvertTo-Json -Depth 5

$r = Http POST "$BASE/auth/signin" $session $signinBody @{
  rid = "emailpassword"; "fdi-version" = "4.1"; "st-auth-mode" = "cookie"
}
Assert "signin HTTP 200" ($r.Status -eq 200) "got $($r.Status): $($r.Content)"
$body = $r.Content | ConvertFrom-Json
Assert "signin status = OK" ($body.status -eq "OK") "got: $($body.status)"

$r = Http GET "$BASE/api/auth-state" $session
$body = $r.Content | ConvertFrom-Json
Assert "onboardingComplete still true" ($body.onboardingComplete -eq $true)
Assert "redirect = dashboard (skips onboarding)" ($body.redirect -eq "/public/dashboard/")

# ------------------------------------------------------------
Section "13. Duplicate signup rejected"

$freshSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$r = Http POST "$BASE/auth/signup" $freshSession $signupBody @{
  rid = "emailpassword"; "fdi-version" = "4.1"; "st-auth-mode" = "cookie"
}
$body = $r.Content | ConvertFrom-Json
Assert "duplicate signup -> EMAIL_ALREADY_EXISTS_ERROR" ($body.status -eq "EMAIL_ALREADY_EXISTS_ERROR") "got: $($body.status)"

# ------------------------------------------------------------
Write-Host "`n=================================" -ForegroundColor Cyan
Write-Host ("PASS: {0}   FAIL: {1}" -f $script:pass, $script:fail) -ForegroundColor $(if ($script:fail -eq 0) { "Green" } else { "Red" })
Write-Host "=================================" -ForegroundColor Cyan
if ($script:fail -gt 0) { exit 1 }