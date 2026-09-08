"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"

/**
 * Hook for printing receipts to a USB thermal printer via WebUSB,
 * with a fallback to the browser's print dialog (window.print()).
 *
 * WebUSB works in Chrome/Edge over HTTPS and lets us send raw ESC/POS bytes
 * directly to the printer — no driver or print server needed.
 *
 * Usage:
 *   const { print, connecting, printing } = useThermalPrinter()
 *   await print(saleId)  // fetches ESC/POS bytes and sends to printer
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
// WebUSB types are not in the standard TS lib; use minimal structural typing.
interface USBDevice {
  open(): Promise<void>
  claimInterface(number: number): Promise<void>
  transferOut(endpointNumber: number, data: BufferSource): Promise<unknown>
  close(): Promise<void>
  configuration: any
}

interface NavigatorUSB {
  usb?: {
    requestDevice(opts: { filters: { vendorId: number }[] }): Promise<USBDevice>
    getDevices(): Promise<USBDevice[]>
  }
  usbDevices?: unknown
}

function findOutEndpoint(device: USBDevice): number {
  const conf = device.configuration
  if (!conf) throw new Error("Printer has no configuration")
  for (const iface of conf.interfaces ?? []) {
    for (const alt of iface.alternate ?? []) {
      for (const ep of alt.endpoints ?? []) {
        if (ep.direction === "out" && ep.type === "bulk") return ep.endpointNumber
      }
    }
  }
  // Default to endpoint 1 for most ESC/POS printers
  return 1
}

export function useThermalPrinter() {
  const [connecting, setConnecting] = useState(false)
  const [printing, setPrinting] = useState(false)

  const print = useCallback(async (saleId: string) => {
    setPrinting(true)
    try {
      // Fetch ESC/POS binary data from the API
      const res = await fetch(`/api/sales/${saleId}/receipt/escpos`)
      if (!res.ok) throw new Error(`Failed to fetch receipt: ${res.status}`)
      const data = await res.arrayBuffer()

      // Try WebUSB first (Chrome/Edge over HTTPS)
      const nav = navigator as NavigatorUSB
      if (nav.usb) {
        try {
          setConnecting(true)
          // Common ESC/POS vendor IDs: EPSON (0x04b8), Star (0x0519), Zjiang (0x0416), Xprinter (0x0491)
          const device = await nav.usb.requestDevice({
            filters: [
              { vendorId: 0x04b8 }, // EPSON
              { vendorId: 0x0519 }, // Star
              { vendorId: 0x0416 }, // Zjiang
              { vendorId: 0x0491 }, // Xprinter
              { vendorId: 0x154f }, // SNBC
              { vendorId: 0x0fe6 }, // ICS Advent
            ],
          })
          await device.open()
          await device.claimInterface(0)
          const endpoint = findOutEndpoint(device)
          await device.transferOut(endpoint, data)
          await device.close()
          toast.success("Reçu imprimé")
          return
        } catch (usbErr) {
          // WebUSB failed or user cancelled — fall through to browser print
          console.info("WebUSB print failed, falling back to browser print:", usbErr)
        } finally {
          setConnecting(false)
        }
      }

      // Fallback: open the PDF receipt in a new window for browser printing
      window.open(`/api/sales/${saleId}/receipt`, "_blank", "noopener,noreferrer")
      toast.info("Ouverture du reçu pour impression")
    } catch (err) {
      console.error("Print failed:", err)
      toast.error("Échec de l'impression du reçu")
    } finally {
      setPrinting(false)
    }
  }, [])

  return { print, connecting, printing }
}
