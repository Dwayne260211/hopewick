package com.bridgebite.hopewick;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Google Play Billing for the Capacitor app. Small on purpose: it does what the TWA's
 * Digital Goods API did (list purchases, buy the subscription) and hands the purchase token
 * to the web code, which sends it to /api/billing/play/verify. The server verifies and
 * acknowledges, exactly as for the TWA. No prices or products are defined here.
 */
@CapacitorPlugin(name = "HopewickBilling")
public class HopewickBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private BillingClient client;
    private PluginCall pendingPurchase;

    @Override
    public void load() {
        client = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection()
            .build();
    }

    private interface Ready { void run(); }

    private void whenReady(PluginCall call, Ready next) {
        if (client.isReady()) { next.run(); return; }
        client.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult r) {
                if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) next.run();
                else call.reject("Google Play billing isn’t available on this device.", String.valueOf(r.getResponseCode()));
            }
            @Override public void onBillingServiceDisconnected() { /* auto reconnection is on */ }
        });
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        whenReady(call, () -> {
            JSObject out = new JSObject();
            out.put("available", true);
            call.resolve(out);
        });
    }

    private static JSObject toJs(Purchase p) {
        JSObject o = new JSObject();
        List<String> ids = p.getProducts();
        o.put("itemId", ids.isEmpty() ? "" : ids.get(0));
        o.put("purchaseToken", p.getPurchaseToken());
        o.put("state", p.getPurchaseState());
        o.put("acknowledged", p.isAcknowledged());
        return o;
    }

    @PluginMethod
    public void listPurchases(PluginCall call) {
        whenReady(call, () -> client.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
            (r, purchases) -> {
                if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) { call.reject("Could not read Google Play purchases.", String.valueOf(r.getResponseCode())); return; }
                JSArray list = new JSArray();
                for (Purchase p : purchases) if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) list.put(toJs(p));
                JSObject out = new JSObject();
                out.put("purchases", list);
                call.resolve(out);
            }));
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null || productId.isEmpty()) { call.reject("productId is required."); return; }
        if (pendingPurchase != null) { call.reject("A Google Play purchase is already open."); return; }
        whenReady(call, () -> {
            QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(productId).setProductType(BillingClient.ProductType.SUBS).build()))
                .build();
            client.queryProductDetailsAsync(params, (r, result) -> {
                List<ProductDetails> found = result == null ? null : result.getProductDetailsList();
                if (r.getResponseCode() != BillingClient.BillingResponseCode.OK || found == null || found.isEmpty()) {
                    call.reject("This subscription isn’t available in Google Play yet.", String.valueOf(r.getResponseCode()));
                    return;
                }
                ProductDetails details = found.get(0);
                List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
                if (offers == null || offers.isEmpty()) { call.reject("This subscription has no offer in Google Play."); return; }
                // Play only lists offers this account can use. Prefer the one with a free-trial phase
                // (most phases), as the TWA purchase sheet did; otherwise the base plan.
                ProductDetails.SubscriptionOfferDetails offer = offers.get(0);
                for (ProductDetails.SubscriptionOfferDetails o : offers) {
                    if (o.getPricingPhases().getPricingPhaseList().size() > offer.getPricingPhases().getPricingPhaseList().size()) offer = o;
                }
                List<BillingFlowParams.ProductDetailsParams> list = new ArrayList<>();
                list.add(BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(details).setOfferToken(offer.getOfferToken()).build());
                BillingFlowParams flow = BillingFlowParams.newBuilder().setProductDetailsParamsList(list).build();
                pendingPurchase = call;
                getActivity().runOnUiThread(() -> {
                    BillingResult launch = client.launchBillingFlow(getActivity(), flow);
                    if (launch.getResponseCode() != BillingClient.BillingResponseCode.OK && pendingPurchase != null) {
                        PluginCall c = pendingPurchase; pendingPurchase = null;
                        c.reject("Google Play purchase did not open.", String.valueOf(launch.getResponseCode()));
                    }
                });
            });
        });
    }

    @Override
    public void onPurchasesUpdated(BillingResult r, List<Purchase> purchases) {
        PluginCall call = pendingPurchase;
        pendingPurchase = null;
        if (call == null) return;
        int code = r.getResponseCode();
        if (code == BillingClient.BillingResponseCode.USER_CANCELED) { call.reject("cancelled", "USER_CANCELED"); return; }
        if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) { call.reject("You already have this subscription. Restoring it.", "ITEM_ALREADY_OWNED"); return; }
        if (code != BillingClient.BillingResponseCode.OK || purchases == null || purchases.isEmpty()) { call.reject("Google Play purchase did not finish.", String.valueOf(code)); return; }
        Purchase p = purchases.get(0);
        if (p.getPurchaseState() == Purchase.PurchaseState.PENDING) { call.reject("Your Google Play payment is pending. Plus turns on when it clears.", "PENDING"); return; }
        call.resolve(toJs(p));
    }
}
