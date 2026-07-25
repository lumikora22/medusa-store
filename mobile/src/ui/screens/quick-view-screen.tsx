import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, type NativeScrollEvent, type NativeSyntheticEvent, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { inventoryService } from "../../application/inventory-service";
import { DEFAULT_CATALOG_FILTERS, type CatalogFilters, type Item, type ItemPhoto } from "../../domain/models";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import { formatMoney, itemStatusLabel } from "../../utils/format";
import { AppButton } from "../components/app-button";
import { ScreenState } from "../components/screen-state";
import { useInterfaceSettings } from "../context/interface-settings";
import { useSnackbar } from "../context/snackbar";

type QuickParams = { status?: string; search?: string; unassignedOnly?: string; photo?: string; sort?: string; locationId?: string };

function filtersFromParams(params: QuickParams): CatalogFilters {
  return {
    ...DEFAULT_CATALOG_FILTERS,
    search: params.search ?? "",
    status: (params.status as CatalogFilters["status"]) ?? "active",
    photo: (params.photo as CatalogFilters["photo"]) ?? "all",
    unassignedOnly: params.unassignedOnly === "1",
    sort: (params.sort as CatalogFilters["sort"]) ?? "newest",
    locationId: params.locationId ? Number(params.locationId) : null,
  };
}

export function QuickViewScreen() {
  const params = useLocalSearchParams<QuickParams>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { notify } = useSnackbar();
  const { exhibitionMode } = useInterfaceSettings();
  const [items, setItems] = useState<Item[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [immersive, setImmersive] = useState(false);
  const filters = useRef(filtersFromParams(params)).current;
  const loadMoreLock = useRef(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const page = await inventoryService.catalog(filters);
      setItems(page.results); setNextOffset(page.nextOffset);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos cargar las prendas.");
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { void load(); }, [load]);

  const loadMore = useCallback(async () => {
    if (nextOffset == null || loadMoreLock.current) return;
    loadMoreLock.current = true;
    try {
      const page = await inventoryService.catalog(filters, nextOffset);
      setItems((existing) => [...existing, ...page.results.filter((item) => !existing.some((candidate) => candidate.id === item.id))]);
      setNextOffset(page.nextOffset);
    } finally { loadMoreLock.current = false; }
  }, [filters, nextOffset]);

  const replaceItem = useCallback((updated: Item) => setItems((existing) => existing.map((item) => (item.id === updated.id ? updated : item))), []);

  const sell = useCallback((item: Item) => {
    void inventoryService.sellItem(item.id).then((sold) => {
      replaceItem(sold);
      notify({ message: `${item.code} marcada como vendida.`, tone: "success", undo: async () => { replaceItem(await inventoryService.restoreSale(item.id, "Venta deshecha")); } });
    }).catch((reason) => notify({ message: reason instanceof Error ? reason.message : "No pudimos registrar la venta.", tone: "error" }));
  }, [notify, replaceItem]);

  const renderItem = useCallback(({ item }: { item: Item }) => (
    <QuickPage
      item={item}
      width={width}
      height={height}
      insetTop={insets.top}
      insetBottom={insets.bottom}
      immersive={immersive}
      readOnly={exhibitionMode}
      onHold={setImmersive}
      onOpen={(id) => router.push({ pathname: "/items/[id]", params: { id: String(id) } })}
      onEdit={(id) => router.push({ pathname: "/items/[id]", params: { id: String(id), edit: "1" } })}
      onMove={(id) => router.push({ pathname: "/transfer", params: { ids: String(id) } })}
      onPrint={(id) => router.push({ pathname: "/labels", params: { itemIds: String(id) } })}
      onSell={sell}
    />
  ), [exhibitionMode, height, immersive, insets.bottom, insets.top, sell, width]);

  return (
    <View style={styles.root}>
      {loading && items.length === 0 ? (
        <ScreenState loading title="Cargando vista rápida" />
      ) : error && items.length === 0 ? (
        <ScreenState title="No pudimos abrir la vista rápida" body={error} action={<AppButton label="Reintentar" icon="reload" onPress={() => void load()} />} />
      ) : items.length === 0 ? (
        <ScreenState title="No hay prendas para mostrar" body="Ajuste los filtros del catálogo e intente de nuevo." action={<AppButton label="Cerrar" icon="close" onPress={() => router.back()} />} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToAlignment="start"
          decelerationRate="fast"
          getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.5}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={3}
        />
      )}
      {!immersive ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar vista rápida"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.close, { top: insets.top + spacing.sm }, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="close" size={26} color={colors.onPrimary} />
        </Pressable>
      ) : null}
    </View>
  );
}

function QuickPage({ item, width, height, insetTop, insetBottom, immersive, readOnly, onHold, onOpen, onEdit, onMove, onPrint, onSell }: {
  item: Item; width: number; height: number; insetTop: number; insetBottom: number; immersive: boolean; readOnly: boolean; onHold: (value: boolean) => void;
  onOpen: (id: number) => void; onEdit: (id: number) => void; onMove: (id: number) => void; onPrint: (id: number) => void; onSell: (item: Item) => void;
}) {
  const photos = item.photos.length ? item.photos : [null];
  const [photoIndex, setPhotoIndex] = useState(0);

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    if (index !== photoIndex) setPhotoIndex(index);
  };

  const renderPhoto = ({ item: photo }: { item: ItemPhoto | null }) => (
    <Pressable
      delayLongPress={220}
      onLongPress={() => onHold(true)}
      onPressOut={() => onHold(false)}
      style={{ width, height }}
    >
      {photo ? (
        <Image source={photo.uri} recyclingKey={photo.stableId} contentFit="cover" transition={150} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={styles.empty}><MaterialCommunityIcons name="hanger" size={96} color={colors.tintStrong} /><Text style={styles.emptyText}>Sin fotografía</Text></View>
      )}
    </Pressable>
  );

  return (
    <View style={{ width, height, backgroundColor: colors.dark }}>
      <FlatList
        data={photos}
        keyExtractor={(photo, index) => (photo ? String(photo.id) : `empty-${index}`)}
        renderItem={renderPhoto}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
      />
      {!immersive ? (
        <>
          {photos.length > 1 ? (
            <View style={[styles.dots, { top: insetTop + spacing.md }]}>
              {photos.map((photo, index) => <View key={photo ? photo.id : index} style={[styles.dot, index === photoIndex && styles.dotActive]} />)}
            </View>
          ) : null}
          <LinearGradient colors={["transparent", "rgba(13,27,42,0.55)", "rgba(13,27,42,0.94)"]} locations={[0.35, 0.68, 1]} style={styles.gradient} pointerEvents="none" />
          <View style={[styles.overlay, { paddingBottom: insetBottom + spacing.lg }]} pointerEvents="box-none">
            <View style={styles.metaRow}>
              <Text style={styles.code}>{item.code}</Text>
              <View style={[styles.statusPill, item.status !== "active" && styles.statusPillMuted]}><Text style={styles.statusText}>{itemStatusLabel(item.status)}</Text></View>
            </View>
            <Text style={styles.price}>{formatMoney(item.status === "sold" ? item.soldPrice ?? item.price : item.price)}</Text>
            <Text numberOfLines={2} style={styles.description}>{item.description || "Sin descripción"}</Text>
            <View style={styles.locationRow}>
              <MaterialCommunityIcons name="map-marker-radius-outline" size={16} color={colors.tintStrong} />
              <Text numberOfLines={1} style={styles.location}>{item.currentLocation?.name ?? "Sin asignar"}</Text>
            </View>
            {item.quantity > 1 ? <Text style={styles.location}>{item.availableQuantity} de {item.quantity} piezas disponibles</Text> : null}
            {readOnly ? null : <>
              <View style={styles.actions}>
                <AppButton grow label="Ver" icon="eye-outline" onPress={() => onOpen(item.id)} />
                <AppButton grow tone="secondary" label="Editar" icon="pencil-outline" onPress={() => onEdit(item.id)} />
              </View>
              <View style={styles.actions}>
                <AppButton grow tone="secondary" label="Mover" icon="swap-horizontal" disabled={item.status !== "active"} onPress={() => onMove(item.id)} />
                <AppButton grow tone="secondary" label="Imprimir" icon="printer-outline" onPress={() => onPrint(item.id)} />
                {item.status === "active" ? <AppButton grow tone="danger" label="Vender" icon="hand-coin-outline" onPress={() => onSell(item)} /> : null}
              </View>
            </>}
            <Text style={styles.hint}>Deslice de lado para ver más fotos · mantenga presionado para ver solo la imagen</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.dark },
  empty: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.primaryDark },
  emptyText: { color: colors.tintStrong, fontWeight: "800" },
  gradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: "60%" },
  overlay: { position: "absolute", left: 0, right: 0, bottom: 0, gap: spacing.sm, paddingHorizontal: spacing.lg },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  code: { flex: 1, color: colors.onPrimary, fontSize: typography.title, fontWeight: "900" },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.success },
  statusPillMuted: { backgroundColor: colors.primaryDark },
  statusText: { color: colors.onPrimary, fontSize: typography.tiny, fontWeight: "900" },
  price: { color: colors.onPrimary, fontSize: 34, fontWeight: "900", letterSpacing: -0.5 },
  description: { color: colors.tint, fontSize: typography.body, lineHeight: 22 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  location: { flex: 1, color: colors.tintStrong, fontWeight: "800" },
  actions: { flexDirection: "row", gap: spacing.sm },
  hint: { color: colors.tintStrong, fontSize: typography.tiny, textAlign: "center", opacity: 0.8, marginTop: spacing.xs },
  dots: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: spacing.xs },
  dot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: "rgba(244,235,221,0.4)" },
  dotActive: { backgroundColor: colors.onPrimary, width: 18 },
  close: { position: "absolute", right: spacing.lg, width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: "rgba(13,27,42,0.55)" },
  pressed: { opacity: 0.7 },
});
