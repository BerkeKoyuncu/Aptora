param(
  [Parameter(Mandatory = $true)]
  [string]$Path,
  [string]$Thumbprint = $env:APTORA_SIGNING_CERT_THUMBPRINT,
  [string]$TimestampServer = $(if ($env:APTORA_TIMESTAMP_SERVER) { $env:APTORA_TIMESTAMP_SERVER } else { 'http://timestamp.digicert.com' })
)

$ErrorActionPreference = 'Stop'
$resolvedPath = (Resolve-Path -LiteralPath $Path).Path
$normalizedThumbprint = ($Thumbprint -replace '\s', '').ToUpperInvariant()
$codeSigningOid = '1.3.6.1.5.5.7.3.3'
$now = Get-Date

$certificates = @(
  Get-ChildItem -Path Cert:\CurrentUser\My, Cert:\LocalMachine\My -ErrorAction SilentlyContinue |
    Where-Object {
      $_.HasPrivateKey -and $_.NotBefore -le $now -and $_.NotAfter -gt $now -and
      ($_.EnhancedKeyUsageList.ObjectId -contains $codeSigningOid)
    }
)

if ($normalizedThumbprint) {
  $certificates = @($certificates | Where-Object { $_.Thumbprint.ToUpperInvariant() -eq $normalizedThumbprint })
}

if ($certificates.Count -eq 0) {
  Write-Warning 'No valid code-signing certificate with a private key was found. AptoraSetup.exe remains unsigned.'
  Write-Warning 'Install the E-Data code-signing certificate, or set APTORA_SIGNING_CERT_THUMBPRINT before building.'
  exit 2
}

if ($certificates.Count -gt 1 -and -not $normalizedThumbprint) {
  Write-Warning 'Multiple code-signing certificates were found. Set APTORA_SIGNING_CERT_THUMBPRINT to select one.'
  exit 2
}

try {
  $signature = Set-AuthenticodeSignature -LiteralPath $resolvedPath -Certificate $certificates[0] `
    -HashAlgorithm SHA256 -TimestampServer $TimestampServer
  if ($signature.Status -ne 'Valid') {
    throw "Signing returned status $($signature.Status): $($signature.StatusMessage)"
  }
  Write-Host "Signed $resolvedPath with certificate $($certificates[0].Thumbprint)."
  exit 0
} catch {
  Write-Error "Installer signing failed: $($_.Exception.Message)"
  exit 1
}
