import Configurator from '../components/configurator/Configurator.jsx'

// no PageHead here — the topbar already titles this page, and the
// workspace wants every vertical pixel for the drawing sheet
export default function ConfiguratorPage() {
  return <Configurator />
}
