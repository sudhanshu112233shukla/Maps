import Capacitor

class MelangeBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginType(MelangeNavigationPlugin.self)
    }
}
