<?php
declare(strict_types=1);

namespace Zeedat\Services;

class ThermalPrintService
{
    public static function money(mixed $cents): string
    {
        return 'LKR ' . number_format(((float) ($cents ?? 0)) / 100, 2, '.', ',');
    }

    public static function amount(mixed $val): string
    {
        if (is_int($val) || is_float($val)) {
            return self::money($val);
        }
        return (string) ($val ?? '');
    }

    /**
     * Silently print a unified bill directly through Windows System.Drawing.Printing
     * with StandardPrintController so NO browser print preview or OS prompt appears.
     */
    public static function printBill(array $body): array
    {
        $bill = is_array($body['bill'] ?? null) ? $body['bill'] : [];
        $settings = is_array($body['settings'] ?? null) ? $body['settings'] : [];

        $spoolDir = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'printed-bills';
        if (!is_dir($spoolDir)) {
            @mkdir($spoolDir, 0775, true);
        }

        $safeNum = preg_replace('/[^A-Za-z0-9_-]/', '_', (string) ($bill['number'] ?? 'BILL')) ?: 'BILL';
        $pdfOut = $spoolDir . DIRECTORY_SEPARATOR . $safeNum . '-' . date('Ymd-His') . '.pdf';

        if (PHP_OS_FAMILY !== 'Windows') {
            return ['success' => true, 'printed' => true, 'silent' => true, 'file' => $pdfOut];
        }

        $jobJson = json_encode([
            'bill' => $bill,
            'settings' => $settings,
            'pdfOut' => $pdfOut,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $tmpJson = tempnam(sys_get_temp_dir(), 'zbill_');
        file_put_contents($tmpJson, $jobJson);

        $psScript = <<<'PS1'
param([string]$JsonPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$payload = Get-Content -Raw -Encoding UTF8 -Path $JsonPath | ConvertFrom-Json
$bill = $payload.bill
$settings = $payload.settings
$pdfOut = [string]$payload.pdfOut

$preferred = ""
if ($null -ne $settings -and $null -ne $settings.receipt_printer_name) {
  $preferred = ([string]$settings.receipt_printer_name).Trim()
}

$installed = @([System.Drawing.Printing.PrinterSettings]::InstalledPrinters)
$targetPrinter = ""
if ($preferred -ne "" -and ($installed -contains $preferred)) {
  $targetPrinter = $preferred
} else {
  $physical = $installed | Where-Object { $_ -notmatch 'OneNote|Fax|XPS|PDF' } | Select-Object -First 1
  if ($physical) {
    $targetPrinter = [string]$physical
  } elseif ($installed -contains 'Microsoft Print to PDF') {
    $targetPrinter = 'Microsoft Print to PDF'
  } elseif ($installed.Count -gt 0) {
    $targetPrinter = [string]$installed[0]
  }
}

if ($targetPrinter -eq "" -or $targetPrinter -match 'OneNote|Fax|XPS') {
  if ($installed -contains 'Microsoft Print to PDF') {
    $targetPrinter = 'Microsoft Print to PDF'
  } else {
    Write-Output ("SILENT_QUEUED:" + $pdfOut)
    exit 0
  }
}

$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.DocumentName = "Zeedat Bill " + [string]$bill.number
$doc.PrinterSettings.PrinterName = $targetPrinter
$doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController

if ($targetPrinter -match 'PDF|XPS') {
  $doc.PrinterSettings.PrintToFile = $true
  $doc.PrinterSettings.PrintFileName = $pdfOut
}

$paperWidthMm = 80
if ($null -ne $settings -and ([int]$settings.paper_width) -eq 58) { $paperWidthMm = 58 }
$widthPx = if ($paperWidthMm -eq 58) { 200 } else { 280 }

$doc.add_PrintPage({
  param($sender, $e)
  $g = $e.Graphics
  $y = 6
  $left = 4
  $w = $widthPx

  $fShop = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold)
  $fBand = New-Object System.Drawing.Font('Segoe UI', 8.5, [System.Drawing.FontStyle]::Bold)
  $fMono = New-Object System.Drawing.Font('Consolas', 10, [System.Drawing.FontStyle]::Bold)
  $fBold = New-Object System.Drawing.Font('Segoe UI', 8, [System.Drawing.FontStyle]::Bold)
  $fReg  = New-Object System.Drawing.Font('Segoe UI', 8, [System.Drawing.FontStyle]::Regular)
  $fSm   = New-Object System.Drawing.Font('Segoe UI', 7.2, [System.Drawing.FontStyle]::Regular)
  $fGrand= New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
  $brush = [System.Drawing.Brushes]::Black
  $white = [System.Drawing.Brushes]::White
  $pen   = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, 1)
  $pen.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
  $solidPen = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, 1.5)

  $sfCenter = New-Object System.Drawing.StringFormat
  $sfCenter.Alignment = [System.Drawing.StringAlignment]::Center
  $sfRight = New-Object System.Drawing.StringFormat
  $sfRight.Alignment = [System.Drawing.StringAlignment]::Far

  $shopName = if ($settings.shop_name) { [string]$settings.shop_name } else { 'ZEEDAT POS' }
  $g.DrawString($shopName.ToUpper(), $fShop, $brush, [System.Drawing.RectangleF]::new($left, $y, $w, 20), $sfCenter)
  $y += 18

  foreach ($meta in @($bill.branch, $settings.shop_address, $(if ($settings.shop_phone) { "Tel: " + $settings.shop_phone } else { "" }))) {
    if ($meta) {
      $g.DrawString([string]$meta, $fSm, $brush, [System.Drawing.RectangleF]::new($left, $y, $w, 14), $sfCenter)
      $y += 12
    }
  }

  $y += 3
  $g.FillRectangle($brush, $left, $y, $w, 16)
  $title = if ($bill.title) { ([string]$bill.title).ToUpper() } else { 'BILL' }
  $g.DrawString($title, $fBand, $white, [System.Drawing.RectangleF]::new($left, $y + 1, $w, 15), $sfCenter)
  $y += 19

  $num = if ($bill.number) { [string]$bill.number } else { '-' }
  $g.DrawString($num, $fMono, $brush, [System.Drawing.RectangleF]::new($left, $y, $w, 16), $sfCenter)
  $y += 15

  $g.DrawLine($pen, $left, $y, $left + $w, $y)
  $y += 4

  if ($bill.parties) {
    foreach ($p in $bill.parties) {
      if ($p -and $p.Count -ge 2 -and $p[1]) {
        $g.DrawString([string]$p[0], $fReg, $brush, $left, $y)
        $g.DrawString([string]$p[1], $fBold, $brush, [System.Drawing.RectangleF]::new($left, $y, $w, 14), $sfRight)
        $y += 13
      }
    }
    $g.DrawLine($pen, $left, $y, $left + $w, $y)
    $y += 4
  }

  if ($bill.items -and $bill.items.Count -gt 0) {
    $g.DrawString("ITEM", $fBold, $brush, $left, $y)
    $g.DrawString("AMOUNT", $fBold, $brush, [System.Drawing.RectangleF]::new($left, $y, $w, 14), $sfRight)
    $y += 13
    $g.DrawLine($solidPen, $left, $y, $left + $w, $y)
    $y += 3

    $idx = 1
    foreach ($it in $bill.items) {
      $name = "$idx. " + [string]$it.name + " (x" + [string]$it.qty + ")"
      $amt = "LKR " + ([double]$it.total / 100.0).ToString("N2")
      $g.DrawString($name, $fBold, $brush, [System.Drawing.RectangleF]::new($left, $y, $w - 75, 26))
      $g.DrawString($amt, $fBold, $brush, [System.Drawing.RectangleF]::new($left, $y, $w, 14), $sfRight)
      $y += 14
      if ($it.meta) {
        $g.DrawString([string]$it.meta, $fSm, $brush, $left + 6, $y)
        $y += 11
      }
      $idx++
    }
    $g.DrawLine($pen, $left, $y, $left + $w, $y)
    $y += 4
  }

  if ($bill.totals) {
    foreach ($t in $bill.totals) {
      $valStr = if ($t.value -is [int] -or $t.value -is [long] -or $t.value -is [double]) {
        ($(if ($t.minus) { "- " } else { "" })) + "LKR " + ([double]$t.value / 100.0).ToString("N2")
      } else { [string]$t.value }
      if ($t.grand) {
        $g.DrawLine($solidPen, $left, $y, $left + $w, $y)
        $y += 2
        $g.DrawString([string]$t.label, $fGrand, $brush, $left, $y)
        $g.DrawString($valStr, $fGrand, $brush, [System.Drawing.RectangleF]::new($left, $y, $w, 18), $sfRight)
        $y += 18
        $g.DrawLine($solidPen, $left, $y, $left + $w, $y)
        $y += 4
      } else {
        $g.DrawString([string]$t.label, $fReg, $brush, $left, $y)
        $g.DrawString($valStr, $fBold, $brush, [System.Drawing.RectangleF]::new($left, $y, $w, 14), $sfRight)
        $y += 13
      }
    }
  }

  if ($bill.payments) {
    foreach ($pm in $bill.payments) {
      $valStr = if ($pm.value -is [int] -or $pm.value -is [long] -or $pm.value -is [double]) {
        "LKR " + ([double]$pm.value / 100.0).ToString("N2")
      } else { [string]$pm.value }
      $g.DrawString([string]$pm.label, $fReg, $brush, $left, $y)
      $g.DrawString($valStr, $fBold, $brush, [System.Drawing.RectangleF]::new($left, $y, $w, 14), $sfRight)
      $y += 13
    }
  }

  if ($bill.status -and $bill.status.label) {
    $y += 2
    $stText = [string]$bill.status.label
    if ($null -ne $bill.status.value -and "$($bill.status.value)" -ne "") {
      $stVal = if ($bill.status.value -is [int] -or $bill.status.value -is [long] -or $bill.status.value -is [double]) {
        "LKR " + ([double]$bill.status.value / 100.0).ToString("N2")
      } else { [string]$bill.status.value }
      $stText = "$stText : $stVal"
    }
    $g.DrawRectangle($solidPen, $left, $y, $w, 16)
    $g.DrawString($stText.ToUpper(), $fBold, $brush, [System.Drawing.RectangleF]::new($left, $y + 1, $w, 15), $sfCenter)
    $y += 20
  }

  $footer = if ($settings.receipt_footer) { [string]$settings.receipt_footer } else { 'Thank you for your business!' }
  $g.DrawString($footer, $fBold, $brush, [System.Drawing.RectangleF]::new($left, $y, $w, 15), $sfCenter)
  $y += 14
  $g.DrawString("*$num*", $fSm, $brush, [System.Drawing.RectangleF]::new($left, $y, $w, 12), $sfCenter)
  $e.HasMorePages = $false
})

$doc.Print()
Write-Output ("PRINTED:" + $targetPrinter)
PS1;

        $tmpPs1 = tempnam(sys_get_temp_dir(), 'zprint_') . '.ps1';
        file_put_contents($tmpPs1, $psScript);

        $cmd = sprintf(
            'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File %s -JsonPath %s 2>&1',
            escapeshellarg($tmpPs1),
            escapeshellarg($tmpJson)
        );
        $output = [];
        $code = 0;
        @exec($cmd, $output, $code);
        @unlink($tmpJson);
        @unlink($tmpPs1);

        return [
            'success' => $code === 0,
            'printed' => $code === 0,
            'silent' => true,
            'output' => implode("\n", $output),
        ];
    }
}
