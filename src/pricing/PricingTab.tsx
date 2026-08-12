// Pricing & Proposal tab.
//
// Embeds the MSP pricing calculator (ported from the pricing_cal project) inside
// the Network Evaluation app. The deal inputs can be prefilled from the
// assessment data (users / locations / devices captured on the form), then every
// plan re-prices live and a support-plan proposal can be exported to .docx.
//
// All markup is wrapped in `.pricing-view` so the calculator's own theme and
// styles (see pricing.css) stay scoped to this tab.

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { type EvalData } from '../schema'
import { calculatePricing, DEFAULT_INPUTS, type PricingInputs } from './lib/pricing'
import { DEFAULT_CATALOG, type Catalog } from './lib/catalog'
import {
  cloneCatalog,
  clearStoredCatalog,
  downloadText,
  isModified,
  loadCatalog,
  saveCatalog,
  serializeCatalogTs,
} from './lib/catalogStore'
import { money } from './lib/format'
import { FEATURES } from './lib/features'
import { InputsPanel } from './components/InputsPanel'
import { PlanCards } from './components/PlanCards'
import { LineItemTable } from './components/LineItemTable'
import { CatalogEditor } from './components/CatalogEditor'
import { ExportPlan } from './components/ExportPlan'
import { prefillFromEvalData } from './prefill'
import './pricing.css'

function Section({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string
  subtitle?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <details className="section" open={defaultOpen}>
      <summary>
        <span className="section-title">{title}</span>
        {subtitle && <span className="section-sub">{subtitle}</span>}
      </summary>
      <div className="section-body">{children}</div>
    </details>
  )
}

interface Props {
  data: EvalData
  inputs: PricingInputs
  setInputs: Dispatch<SetStateAction<PricingInputs>>
}

export function PricingTab({ data, inputs, setInputs }: Props) {
  const [catalog, setCatalogState] = useState<Catalog>(() => loadCatalog())
  const [showEditor, setShowEditor] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const result = useMemo(() => calculatePricing(inputs, catalog), [inputs, catalog])

  const patch = (p: Partial<PricingInputs>) => setInputs((prev) => ({ ...prev, ...p }))

  const setCatalog = (next: Catalog) => {
    setCatalogState(next)
    saveCatalog(next)
  }
  const resetCatalog = () => {
    clearStoredCatalog()
    setCatalogState(cloneCatalog(DEFAULT_CATALOG))
  }
  const exportCatalog = () => downloadText('catalog.ts', serializeCatalogTs(catalog))
  const catalogModified = isModified(catalog)

  const useAssessmentData = () => patch(prefillFromEvalData(data))

  const setUnitOverride = (key: string, value: number | null) =>
    setInputs((prev) => {
      const next = { ...prev.hardwareUnitOverrides }
      if (value == null) delete next[key]
      else next[key] = value
      return { ...prev, hardwareUnitOverrides: next }
    })
  const overrideCount = Object.keys(inputs.hardwareUnitOverrides).length

  return (
    <div className="pricing-view">
      <div className="app">
        <div className="pricing-toolbar">
          <div>
            <h2 className="content-title">Pricing &amp; Proposal</h2>
            <p className="tagline">
              Enterprise HaaS model · {Math.round(result.deviceCount)} devices ·{' '}
              {inputs.travelRequired ? 'with travel' : 'no travel'}
            </p>
          </div>
          <div className="header-actions">
            <button type="button" className="btn" onClick={useAssessmentData}>
              Use assessment data
            </button>
            <button type="button" className="btn primary" onClick={() => setShowExport(true)}>
              Export support plan
            </button>
            <button
              type="button"
              className={`btn edit-toggle ${showEditor ? 'active' : ''}`}
              onClick={() => setShowEditor((v) => !v)}
            >
              {showEditor ? 'Close editor' : 'Edit catalog'}
              {catalogModified && <span className="dot" title="Catalog edited" />}
            </button>
          </div>
        </div>

        {showExport && (
          <ExportPlan plans={result.plans} users={inputs.users} onClose={() => setShowExport(false)} />
        )}

        {showEditor && (
          <section className="editor-panel">
            <h2 className="content-title">Edit catalog — costs &amp; items</h2>
            <CatalogEditor
              catalog={catalog}
              onChange={setCatalog}
              onExport={exportCatalog}
              onReset={resetCatalog}
              modified={catalogModified}
            />
          </section>
        )}

        <div className="layout">
          <aside className="sidebar">
            <InputsPanel inputs={inputs} onChange={patch} onReset={() => setInputs(DEFAULT_INPUTS)} />
          </aside>

          <main className="content">
            <section>
              <h2 className="content-title">Plans</h2>
              <PlanCards plans={result.plans} />
            </section>

            <section className="details">
              <h2 className="content-title">Cost breakdown</h2>

              <Section
                title="Hardware (HaaS)"
                subtitle={`Monthly: ${money(result.hardware.monthlyPrice)} · one-time ${money(
                  result.hardware.extPrice,
                )}${overrideCount ? ` · ${overrideCount} override${overrideCount > 1 ? 's' : ''}` : ''}`}
              >
                <p className="section-hint">
                  Units are editable — override any default to match the actual quote, then ↺ to revert.
                </p>
                <LineItemTable
                  lines={result.hardware.lines}
                  onUnitOverride={setUnitOverride}
                  footer={{
                    label: 'Total',
                    extCost: result.hardware.extCost,
                    extPrice: result.hardware.extPrice,
                  }}
                />
                <div className="mini-summary">
                  <span>Monthly cost (÷60): {money(result.hardware.monthlyCost)}</span>
                  <span>Monthly price (÷60 ×1.2): {money(result.hardware.monthlyPrice)}</span>
                </div>
              </Section>

              <Section title="Managed Tools" subtitle={`${money(result.tools.extCost)} / mo cost`}>
                <LineItemTable
                  lines={result.tools.lines}
                  showPrice={false}
                  footer={{ label: 'Total', extCost: result.tools.extCost }}
                />
              </Section>

              <Section title="Labor" subtitle={inputs.travelRequired ? 'Travel rates' : 'No-travel rates'}>
                {result.labor.map((tier) => (
                  <div key={tier.key} className="labor-tier">
                    <h4>{tier.label}</h4>
                    <LineItemTable
                      lines={tier.lines}
                      showPrice={false}
                      footer={{ label: `${tier.label} total`, extCost: tier.monthlyCost }}
                    />
                  </div>
                ))}
              </Section>

              {FEATURES.orr && (
                <Section title="O365 / Datto (ORR)" subtitle="Pass-through recurring">
                  <LineItemTable lines={[result.orr.o365, result.orr.datto]} />
                </Section>
              )}
            </section>
          </main>
        </div>
      </div>
    </div>
  )
}
