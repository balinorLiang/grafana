// SPDX-License-Identifier: AGPL-3.0-only
// Provenance-includes-location: https://github.com/kubernetes/kubernetes/blob/master/staging/src/k8s.io/apiserver/pkg/storage/etcd3/watcher_test.go
// Provenance-includes-license: Apache-2.0
// Provenance-includes-copyright: The Kubernetes Authors.

package file

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	clientv3 "go.etcd.io/etcd/client/v3"
	"k8s.io/apimachinery/pkg/api/apitesting"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/runtime/serializer"
	utilruntime "k8s.io/apimachinery/pkg/util/runtime"
	"k8s.io/apiserver/pkg/apis/example"
	examplev1 "k8s.io/apiserver/pkg/apis/example/v1"
	"k8s.io/apiserver/pkg/storage"
	"k8s.io/apiserver/pkg/storage/etcd3/testserver"
	"k8s.io/apiserver/pkg/storage/storagebackend"
	storagetesting "k8s.io/apiserver/pkg/storage/testing"
)

var scheme = runtime.NewScheme()
var codecs = serializer.NewCodecFactory(scheme)

func init() {
	metav1.AddToGroupVersion(scheme, metav1.SchemeGroupVersion)
	utilruntime.Must(example.AddToScheme(scheme))
	utilruntime.Must(examplev1.AddToScheme(scheme))
}

type setupOptions struct {
	client         func(testing.TB) *clientv3.Client
	codec          runtime.Codec
	newFunc        func() runtime.Object
	newListFunc    func() runtime.Object
	prefix         string
	resourcePrefix string
	groupResource  schema.GroupResource

	recorderEnabled bool
}

type setupOption func(*setupOptions)

func withDefaults(options *setupOptions) {
	options.client = func(t testing.TB) *clientv3.Client {
		return testserver.RunEtcd(t, nil)
	}
	options.codec = apitesting.TestCodec(codecs, examplev1.SchemeGroupVersion)
	options.newFunc = newPod
	options.newListFunc = newPodList
	options.prefix = os.TempDir()
	options.resourcePrefix = "/pods"
	options.groupResource = schema.GroupResource{Resource: "pods"}
}

var _ setupOption = withDefaults

func testSetup(t testing.TB, opts ...setupOption) (context.Context, storage.Interface, error) {
	setupOpts := setupOptions{}
	opts = append([]setupOption{withDefaults}, opts...)
	for _, opt := range opts {
		opt(&setupOpts)
	}

	config := storagebackend.NewDefaultConfig(setupOpts.prefix, setupOpts.codec)
	store, _, err := NewStorage(
		config.ForResource(setupOpts.groupResource),
		setupOpts.resourcePrefix,
		func(obj runtime.Object) (string, error) {
			return storage.NamespaceKeyFunc(setupOpts.resourcePrefix, obj)
		},
		setupOpts.newFunc,
		setupOpts.newListFunc,
		storage.DefaultNamespaceScopedAttr,
		make(map[string]storage.IndexerFunc, 0),
		nil,
	)

	if err != nil {
		return nil, nil, err
	}
	ctx := context.Background()
	return ctx, store, nil
}

func TestWatch(t *testing.T) {
	ctx, store, err := testSetup(t)
	assert.NoError(t, err)
	fmt.Println("TestWatch...")
	storagetesting.RunTestWatch(ctx, t, store)
}

func TestClusterScopedWatch(t *testing.T) {
	ctx, store, err := testSetup(t)
	assert.NoError(t, err)
	storagetesting.RunTestClusterScopedWatch(ctx, t, store)
}

func TestNamespaceScopedWatch(t *testing.T) {
	ctx, store, err := testSetup(t)
	assert.NoError(t, err)
	storagetesting.RunTestNamespaceScopedWatch(ctx, t, store)
}

func TestDeleteTriggerWatch(t *testing.T) {
	ctx, store, err := testSetup(t)
	assert.NoError(t, err)
	storagetesting.RunTestDeleteTriggerWatch(ctx, t, store)
}

func TestWatchFromZero(t *testing.T) {
	ctx, store, err := testSetup(t)
	assert.NoError(t, err)
	storagetesting.RunTestWatchFromZero(ctx, t, store, func(_ context.Context, _ *testing.T, _ string) {})
}

// TestWatchFromNonZero tests that
// - watch from non-0 should just watch changes after given version
func TestWatchFromNoneZero(t *testing.T) {
	ctx, store, err := testSetup(t)
	assert.NoError(t, err)
	storagetesting.RunTestWatchFromNonZero(ctx, t, store)
}

func TestDelayedWatchDelivery(t *testing.T) {
	ctx, store, err := testSetup(t)
	assert.NoError(t, err)
	storagetesting.RunTestDelayedWatchDelivery(ctx, t, store)
}

/* func TestWatchError(t *testing.T) {
	ctx, store, _ := testSetup(t)
	storagetesting.RunTestWatchError(ctx, t, &storeWithPrefixTransformer{store})
} */

func TestWatchContextCancel(t *testing.T) {
	ctx, store, err := testSetup(t)
	assert.NoError(t, err)
	storagetesting.RunTestWatchContextCancel(ctx, t, store)
}

func TestWatcherTimeout(t *testing.T) {
	ctx, store, err := testSetup(t)
	assert.NoError(t, err)
	storagetesting.RunTestWatcherTimeout(ctx, t, store)
}

func TestWatchDeleteEventObjectHaveLatestRV(t *testing.T) {
	ctx, store, err := testSetup(t)
	assert.NoError(t, err)
	storagetesting.RunTestWatchDeleteEventObjectHaveLatestRV(ctx, t, store)
}

func TestWatchInitializationSignal(t *testing.T) {
	ctx, store, _ := testSetup(t)
	storagetesting.RunTestWatchInitializationSignal(ctx, t, store)
}

func TestProgressNotify(t *testing.T) {
	clusterConfig := testserver.NewTestConfig(t)
	clusterConfig.ExperimentalWatchProgressNotifyInterval = time.Second
	ctx, store, _ := testSetup(t)

	storagetesting.RunOptionalTestProgressNotify(ctx, t, store)
}

// TestWatchDispatchBookmarkEvents makes sure that
// setting allowWatchBookmarks query param against
// etcd implementation doesn't have any effect.
func TestWatchDispatchBookmarkEvents(t *testing.T) {
	clusterConfig := testserver.NewTestConfig(t)
	clusterConfig.ExperimentalWatchProgressNotifyInterval = time.Second
	ctx, store, _ := testSetup(t)

	storagetesting.RunTestWatchDispatchBookmarkEvents(ctx, t, store, false)
}

func TestSendInitialEventsBackwardCompatibility(t *testing.T) {
	ctx, store, _ := testSetup(t)
	storagetesting.RunSendInitialEventsBackwardCompatibility(ctx, t, store)
}

func TestEtcdWatchSemantics(t *testing.T) {
	ctx, store, _ := testSetup(t)
	storagetesting.RunWatchSemantics(ctx, t, store)
}

func TestEtcdWatchSemanticInitialEventsExtended(t *testing.T) {
	ctx, store, _ := testSetup(t)
	storagetesting.RunWatchSemanticInitialEventsExtended(ctx, t, store)
}

func initStoreData(ctx context.Context, store storage.Interface) ([]interface{}, error) {
	barFirst := &example.Pod{ObjectMeta: metav1.ObjectMeta{Namespace: "first", Name: "bar"}}
	barSecond := &example.Pod{ObjectMeta: metav1.ObjectMeta{Namespace: "second", Name: "bar"}}

	preset := []struct {
		key       string
		obj       *example.Pod
		storedObj *example.Pod
	}{
		{
			key: fmt.Sprintf("/pods/%s/%s", barFirst.Namespace, barFirst.Name),
			obj: barFirst,
		},
		{
			key: fmt.Sprintf("/pods/%s/%s", barSecond.Namespace, barSecond.Name),
			obj: barSecond,
		},
	}

	for i, ps := range preset {
		preset[i].storedObj = &example.Pod{}
		err := store.Create(ctx, ps.key, ps.obj, preset[i].storedObj, 0)
		if err != nil {
			return nil, fmt.Errorf("failed to create object: %w", err)
		}
	}

	var created []interface{}
	for _, item := range preset {
		created = append(created, item.key)
	}
	return created, nil
}

func newPod() runtime.Object {
	return &example.Pod{}
}

func newPodList() runtime.Object {
	return &example.PodList{}
}