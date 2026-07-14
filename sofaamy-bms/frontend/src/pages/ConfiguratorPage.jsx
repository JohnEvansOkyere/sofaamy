import { PageHead } from '../components/ui.jsx'
import Configurator from '../components/configurator/Configurator.jsx'

export default function ConfiguratorPage() {
  return (
    <>
      <PageHead
        title="Design Configurator"
        subtitle="Drag a shape from the library, split it with dividers, set each section's glass & opening — live GHS quote as you build."
      >
        <span className="badge b-green"><span className="bdot"/>Fully interactive</span>
      </PageHead>
      <Configurator />
    </>
  )
}
